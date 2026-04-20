#include <algorithm>
#include <cctype>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <set>
#include <sstream>
#include <string>
#include <vector>

struct FunctionCallInfo {
    std::string functionName;
    uint64_t memoryAddress = 0;
    std::vector<uint64_t> parameters;
    std::string description;
};

struct LogEntry {
    size_t lineNumber = 0;
    uint64_t address = 0;
    std::string raw;
    std::string symbol;
    std::string description;
};

struct FileMetrics {
    std::string fileName;
    size_t originalLines = 0;
    size_t reducedLines = 0;
    uintmax_t originalBytes = 0;
    uintmax_t reducedBytes = 0;
};

static std::string trim(const std::string &value) {
    const auto start = value.find_first_not_of(" \t\r\n");
    if (start == std::string::npos) return "";
    const auto end = value.find_last_not_of(" \t\r\n");
    return value.substr(start, end - start + 1);
}

static std::string lower(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return value;
}

static std::vector<std::string> splitCsvSimple(const std::string &line) {
    std::vector<std::string> parts;
    std::stringstream ss(line);
    std::string item;
    while (std::getline(ss, item, ',')) {
        parts.push_back(trim(item));
    }
    return parts;
}

static uint64_t parseHex(const std::string &value) {
    std::string cleaned = trim(value);
    if (cleaned.empty()) return 0;
    return std::stoull(cleaned, nullptr, 16);
}

class SelectiveTracingEngine {
  private:
    bool granularTracingActive = false;
    uint64_t triggerAddress = 0;
    std::vector<uint64_t> suspiciousAddresses;

  public:
    bool IsSuspiciousAPI(const std::string &functionName) {
        static const std::set<std::string> suspicious = {
            "VirtualProtect", "VirtualProtectEx", "VirtualAlloc", "VirtualAllocEx", "WriteProcessMemory"
        };
        return suspicious.count(functionName) > 0;
    }

    bool ShouldTriggerGranularTracing(const FunctionCallInfo &info) {
        if (info.functionName == "VirtualProtect" || info.functionName == "VirtualProtectEx") {
            const std::string desc = lower(info.description);
            return desc.find("rw para rx") != std::string::npos ||
                   desc.find("rw->rx") != std::string::npos ||
                   desc.find("rw to rx") != std::string::npos;
        }
        return false;
    }

    void ActivateGranularTracing(uint64_t address) {
        granularTracingActive = true;
        triggerAddress = address;
        suspiciousAddresses.push_back(address);
    }

    void OnFunctionIntercepted(const FunctionCallInfo &info) {
        if (IsSuspiciousAPI(info.functionName) && ShouldTriggerGranularTracing(info)) {
            ActivateGranularTracing(info.memoryAddress);
        }
    }

    bool isGranularTracingActive() const { return granularTracingActive; }
    uint64_t getTriggerAddress() const { return triggerAddress; }

    bool ShouldKeepInstruction(const LogEntry &entry) const {
        if (!granularTracingActive) return false;
        const auto distance = entry.address > triggerAddress ? entry.address - triggerAddress : triggerAddress - entry.address;
        const std::string rawLower = lower(entry.raw);
        return distance <= 0x20 ||
               rawLower.find("virtualprotect") != std::string::npos ||
               rawLower.find("isdebuggerpresent") != std::string::npos ||
               rawLower.find("ntqueryinformationprocess") != std::string::npos;
    }

    bool ShouldKeepMemory(const LogEntry &entry) const {
        if (!granularTracingActive) return false;
        const auto distance = entry.address > triggerAddress ? entry.address - triggerAddress : triggerAddress - entry.address;
        const std::string rawLower = lower(entry.raw);
        return distance <= 0x10 || rawLower.find("rw->rx") != std::string::npos || rawLower.find("protect") != std::string::npos;
    }
};

static std::vector<FunctionCallInfo> loadFunctionInterceptor(const std::filesystem::path &path) {
    std::ifstream file(path);
    if (!file) throw std::runtime_error("Nao foi possivel abrir FunctionInterceptor");

    std::vector<FunctionCallInfo> entries;
    std::string line;
    while (std::getline(file, line)) {
        line = trim(line);
        if (line.empty()) continue;
        auto parts = splitCsvSimple(line);
        if (parts.size() < 5) continue;
        if (!std::isdigit(static_cast<unsigned char>(parts[0][0]))) continue;
        FunctionCallInfo info;
        info.functionName = parts[1];
        info.memoryAddress = parseHex(parts[3]);
        info.description = parts[4];
        entries.push_back(info);
    }
    return entries;
}

static std::vector<LogEntry> loadGranularLog(const std::filesystem::path &path) {
    std::ifstream file(path);
    if (!file) throw std::runtime_error("Nao foi possivel abrir log granular");

    std::vector<LogEntry> entries;
    std::string line;
    while (std::getline(file, line)) {
        std::string trimmed = trim(line);
        if (trimmed.empty()) continue;
        auto parts = splitCsvSimple(trimmed);
        if (parts.size() < 5) continue;
        if (!std::isdigit(static_cast<unsigned char>(parts[0][0]))) continue;
        LogEntry entry;
        entry.lineNumber = static_cast<size_t>(std::stoull(parts[0]));
        entry.address = parseHex(parts[1]);
        entry.symbol = parts[2];
        entry.raw = trimmed;
        entry.description = parts.back();
        entries.push_back(entry);
    }
    return entries;
}

static void writeReducedFile(const std::filesystem::path &path, const std::vector<LogEntry> &entries) {
    std::ofstream out(path);
    for (const auto &entry : entries) {
        out << entry.raw << "\n";
    }
}

static FileMetrics measureFileReduction(const std::filesystem::path &originalPath, const std::filesystem::path &reducedPath, size_t originalLines, size_t reducedLines) {
    FileMetrics metrics;
    metrics.fileName = originalPath.filename().string();
    metrics.originalLines = originalLines;
    metrics.reducedLines = reducedLines;
    metrics.originalBytes = std::filesystem::file_size(originalPath);
    metrics.reducedBytes = std::filesystem::file_size(reducedPath);
    return metrics;
}

int main(int argc, char **argv) {
    if (argc < 5) {
        std::cerr << "Uso: selective_reducer <FunctionInterceptor.csv> <TraceInstructions.csv> <TraceMemory.csv> <output_dir>\n";
        return 1;
    }

    const std::filesystem::path functionPath = argv[1];
    const std::filesystem::path instructionsPath = argv[2];
    const std::filesystem::path memoryPath = argv[3];
    const std::filesystem::path outputDir = argv[4];
    std::filesystem::create_directories(outputDir);

    SelectiveTracingEngine engine;
    const auto functionEntries = loadFunctionInterceptor(functionPath);
    for (const auto &entry : functionEntries) {
        engine.OnFunctionIntercepted(entry);
    }

    if (!engine.isGranularTracingActive()) {
        std::cerr << "Nenhum gatilho RW->RX foi detectado.\n";
        return 2;
    }

    const auto instructionEntries = loadGranularLog(instructionsPath);
    const auto memoryEntries = loadGranularLog(memoryPath);

    std::vector<LogEntry> reducedInstructions;
    std::copy_if(instructionEntries.begin(), instructionEntries.end(), std::back_inserter(reducedInstructions), [&](const LogEntry &entry) {
        return engine.ShouldKeepInstruction(entry);
    });

    std::vector<LogEntry> reducedMemory;
    std::copy_if(memoryEntries.begin(), memoryEntries.end(), std::back_inserter(reducedMemory), [&](const LogEntry &entry) {
        return engine.ShouldKeepMemory(entry);
    });

    const auto reducedInstructionsPath = outputDir / "TraceInstructions_reduced.csv";
    const auto reducedMemoryPath = outputDir / "TraceMemory_reduced.csv";
    writeReducedFile(reducedInstructionsPath, reducedInstructions);
    writeReducedFile(reducedMemoryPath, reducedMemory);

    const auto instructionsMetrics = measureFileReduction(instructionsPath, reducedInstructionsPath, instructionEntries.size(), reducedInstructions.size());
    const auto memoryMetrics = measureFileReduction(memoryPath, reducedMemoryPath, memoryEntries.size(), reducedMemory.size());

    const auto combinedOriginalBytes = instructionsMetrics.originalBytes + memoryMetrics.originalBytes;
    const auto combinedReducedBytes = instructionsMetrics.reducedBytes + memoryMetrics.reducedBytes;
    const auto combinedOriginalLines = instructionsMetrics.originalLines + memoryMetrics.originalLines;
    const auto combinedReducedLines = instructionsMetrics.reducedLines + memoryMetrics.reducedLines;
    const double reductionPercent = combinedOriginalBytes == 0 ? 0.0 : 100.0 * (1.0 - static_cast<double>(combinedReducedBytes) / static_cast<double>(combinedOriginalBytes));

    const auto metricsPath = outputDir / "reduction_metrics.json";
    std::ofstream metrics(metricsPath);
    metrics << std::fixed << std::setprecision(2);
    metrics << "{\n";
    metrics << "  \"trigger_address\": \"0x" << std::hex << std::uppercase << engine.getTriggerAddress() << std::dec << "\",\n";
    metrics << "  \"files\": [\n";
    metrics << "    {\n";
    metrics << "      \"file\": \"" << instructionsMetrics.fileName << "\",\n";
    metrics << "      \"original_lines\": " << instructionsMetrics.originalLines << ",\n";
    metrics << "      \"reduced_lines\": " << instructionsMetrics.reducedLines << ",\n";
    metrics << "      \"original_bytes\": " << instructionsMetrics.originalBytes << ",\n";
    metrics << "      \"reduced_bytes\": " << instructionsMetrics.reducedBytes << "\n";
    metrics << "    },\n";
    metrics << "    {\n";
    metrics << "      \"file\": \"" << memoryMetrics.fileName << "\",\n";
    metrics << "      \"original_lines\": " << memoryMetrics.originalLines << ",\n";
    metrics << "      \"reduced_lines\": " << memoryMetrics.reducedLines << ",\n";
    metrics << "      \"original_bytes\": " << memoryMetrics.originalBytes << ",\n";
    metrics << "      \"reduced_bytes\": " << memoryMetrics.reducedBytes << "\n";
    metrics << "    }\n";
    metrics << "  ],\n";
    metrics << "  \"combined\": {\n";
    metrics << "    \"original_lines\": " << combinedOriginalLines << ",\n";
    metrics << "    \"reduced_lines\": " << combinedReducedLines << ",\n";
    metrics << "    \"original_bytes\": " << combinedOriginalBytes << ",\n";
    metrics << "    \"reduced_bytes\": " << combinedReducedBytes << ",\n";
    metrics << "    \"reduction_percent\": " << reductionPercent << "\n";
    metrics << "  }\n";
    metrics << "}\n";

    std::cout << metricsPath << "\n";
    return 0;
}
