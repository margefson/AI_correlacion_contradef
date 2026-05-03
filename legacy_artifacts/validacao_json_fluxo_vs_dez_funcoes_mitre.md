# Validação: JSON gerado pela app vs fluxos das 10 funções e MITRE (TA0005)

Este texto **substitui a necessidade de um JSON teu específico** para a primeira auditoria conceitual: cruza os **fluxos já registados em `legacy_artifacts`**, um **JSON de referência exemplificativo** (`isdebuggerpresent_flow/outputs/fluxo_isdebuggerpresent.json`), e o **comportamento real do código** do `ai_correlacion_web` (lista `suspiciousApis`, grafo `flowGraph`, mapeamento `buildMitreDefenseEvasionFromEvidence`).

Para uma **certificação caso a caso** (nova amostra), use o mesmo *checklist* no fim com um ficheiro **Fluxo (.json)** e **Resumo (.json)** descarregados da interpretação consolidada.

---

## 1. Dois mundos diferentes (para não esperar igualdade falsa)

| Representação | O que são os nós e arestas | “Batem” com FI→M1→M2→TI→TM→TD? |
|----------------|----------------------------|-------------------------------|
| **Fluxos mapeados** (`fluxo_*_mapeado.md`) | Metodologia forense: **tipos de ficheiro Contradéf** em torno de uma API pivô | Sim, por desenho |
| **`fluxo_isdebuggerpresent.json`** (legado) | Modelo **conceitual** com nós por função + `TraceFcnCall.M1` / `TraceInstructions`… | Sim (é o template “documental”) |
| **`flowGraph` na app** | Fases heurísticas + até **28 eventos suspeitos** (substrings de API na linha reduzida) | **Não** como grafo isomórfico; só **ordem de APIs** e **fase** |
| **`mitreDefenseEvasion` no JSON** | Deriva de **APIs na lista `suspiciousApis`** + **etiquetas heurísticas** (`detectTechniqueTags`) | Parcial; ver §3 |

Conclusão: **“comportamentos certos”** para o produto actual significam: (a) as APIs que interessam às dez funções **aparecem** na jornada quando o log as contém de forma detectável; (b) as técnicas **TA0005** fazem sentido onde o mapeamento cobre essas APIs. **Não** significam: vértices `TraceFcnCall.M1` dentro do JSON da app.

---

## 2. Os dez pivôs versus o detector actual (`suspiciousApis`)

Lista em `analysisService.ts` (~linhas 121–141): apenas strings **contidas na linha** (`line.includes(api)`).

| Pivô documentado nos fluxos legacy | Surgirá como `suspiciousApis` na linha reduzida? | Nota |
|------------------------------------|--------------------------------------------------|------|
| `IsDebuggerPresent` | Sim | Lista explícita |
| `CheckRemoteDebuggerPresent` | Sim | Lista explícita |
| **`NtQueryInformationProcess`** | Sim | Lista explícita |
| **`ZwQueryInformationProcess`** | Sim (desde commit de alinhamento com o legado Zw/Nt) | Tratado como **anti-debug** ao nível de **`NtQueryInformationProcess`** (T1622) |
| `LoadLibraryA` | **Não** | Não está em `suspiciousApis`; pode aparecer no grafo por outras palavras-chave vagas (**`determineStage`**) não como rotúlo de pivô garantido |
| `GetACP` | **Não** | Sem detecção dedicada |
| `FreeEnvironmentStringsW` | **Não** | Sem detecção dedicada |
| `FlsAlloc` / `FlsSetValue` / `FlsGetValue` | **Não** | Sem detecção dedicada |
| `CreateThread` | **Não** (**`CreateRemoteThread`** existe) | Threads “normais” não activam substring dedicada |

**Interpretação:** os fluxos M1 registados são **corrida analítica** sobre *todos* os tipos de log; o motor web **prioriza APIs de alto valor de evasão/injeção** na lista acima. **Seis dos dez pivôs** não têm correspondência directa em `suspiciousApis`. Isso **não invalida** o uso dos fluxos legados na análise manual; **limita** a capacidade de o **JSON automático** “provar” esses comportamentos só pelos nós `event:*` e pelo painel MITRE.

---

## 3. MITRE TA0005 mapeado no código (`buildMitreDefenseEvasionFromEvidence`)

Fonte: `shared/mitreDefenseEvasion.ts`.

| Condição (API detectada na agregação) | Técnica(s) Enterprise atribuídas |
|--------------------------------------|-----------------------------------|
| `IsDebuggerPresent`, `CheckRemoteDebuggerPresent`, `NtQueryInformationProcess`, `ZwQueryInformationProcess` | **T1622** Debugger Evasion |
| `GetTickCount`, `RtlQueryPerformanceCounter` | **T1497.003** Time Based Checks |
| `EnumSystemFirmwareTables` | **T1497.001** System Checks |
| `GetProcAddress` | **T1027.007** Dynamic API Resolution |
| `VirtualProtect`, `VirtualAlloc` | **T1027** Obfuscated Files or Information (heurística agregada) |
| `WriteProcessMemory` | **T1055.002** PE Injection |
| `CreateRemoteThread` | **T1055.001** DLL Injection |
| `Sleep`, `NtDelayExecution` | **T1678** Delay Execution |
| `DeleteFile` | **T1070.004** File Deletion |

Etiquetas heurísticas (`Anti-debug`, `Detecção de VM`, `Verificação de overhead`, `Transição RW→RX`, …) também alimentam TA0005 via `HEURISTIC_BASE` no mesmo ficheiro.

**Cruzamento com `fluxo_isdebuggerpresent.json`:** o JSON legado inclui `timing_evasion` (GetTickCount / QPC), `anti_vm` (firmware/WMI), `virtualprotect`, anti-debug em `FunctionInterceptor` — **isso alinha** com o que o motor **pode** marcar em TA0005 **desde que** as linhas reduzidas contenham as substrings certas (p.ex. `GetTickCount`, `EnumSystemFirmwareTables`, `VirtualProtect`, `IsDebuggerPresent`…). **Não alinha** com nós nomeados `tracefcncall_m1` / `traceinstructions_branch` no produto web (esses existem só no JSON documental).

---

## 4. Checklist para “está a bater” com os comportamentos registados

Use quando tiver **Resumo (.json)** ou **Fluxo (.json)** de um job real.

1. **Anti-debug (APIs anti-depurador na lista)**  
   - No `summaryJson` / `flowGraph`: procurar `IsDebuggerPresent`, `CheckRemoteDebuggerPresent`, `NtQueryInformationProcess`, `ZwQueryInformationProcess`.  
   - Em `mitreDefenseEvasion.techniques`: deve existir evidência **T1622** se essas APIs estiverem entre as detectadas na agregação.  
   - **Legado:** encadeamento IDP → CRDP → Nt/Zw (classe 30) no `fluxo_isdebuggerpresent.json` → na app, confirme **ordem temporal** na jornada (até 28 eventos), não arestas obrigatórias entre cada par.

2. **Temporal / anti-overhead**  
   - Presença de `GetTickCount` / `RtlQueryPerformanceCounter` → **T1497.003** quando a API entra no agregado.

3. **Anti-VM (parcial)**  
   - `EnumSystemFirmwareTables` → **T1497.001**.  
   - Menções “WMI” / “virtualbox” nas linhas → etiqueta `Detecção de VM` → novamente **T1497.001** por heurística.

4. **Unpack / memória executável**  
   - `VirtualProtect` / `VirtualAlloc` + heurística RW→RX → **T1027** e possivelmente gatilho crítico no grafo.

5. **Seis pivôs sem detector dedicado** (`LoadLibraryA`, `GetACP`, `FreeEnvironmentStringsW`, FLS×3, `CreateThread`)  
   - **Não** espere correspondência automática forte no `flowGraph` nem em TA0005 só por estes símbolos.  
   - Validação = **revisão de log** + futura extensão da lista `suspiciousApis` / regras por tipo de ficheiro.

---

## 5. O que falta para “classificar malware certinho” em lote (recomendações técnicas)

Ordenadas por impacto para o teu objectivo (vários malwares, MITRE consistente):

1. **Variantes de símbolo nos logs** (truncagens, formato do trace) podem impedir substring match mesmo com `Zw`/`Nt` na lista — considerar aliases adicionais se aparecerem nos teus `.cdf`/reduzidos.  
2. **Expandir `suspiciousApis`** (e o mapeamento MITRE onde fizer sentido) para os pivôs documentados: no mínimo `LoadLibraryA`, `CreateThread`, FLS, `GetACP`, `FreeEnvironmentStringsW` — com cuidado para falsos positivos em binários legítimos.  
3. **Modelo opcional de segundo grafo** “por tipo de artefacto” (FI / M1 / M2 / …) **só** quando o *bundle* trouxer esses ficheiros, para bater com os `fluxo_*_mapeado.md` sem confundir com o grafo heurístico actual.  
4. **Testes de regressão** com um job de referência (mesmo lote que originou os dez mapeamentos) e um script que verifica: APIs esperadas ⊆ jornada; técnicas TA0005 esperadas ⊆ `mitreDefenseEvasion`.

---

## 6. Resposta directa à tua pergunta

- **Com os JSON que a app gera hoje**, dá para validar **bem** a parte que os legados e o `fluxo_isdebuggerpresent.json` partilham com o motor: **anti-debug explícito, temporizadores, VM (parcial), VirtualProtect/Alloc, injeção, atraso, DeleteFile, GetProcAddress**.  
- **Não** dá para dizer que o JSON “bate” com **todos** os comportamentos descritos para **as dez funções** enquanto **seis** pivôs do mapeamento M1 continuarem **fora** de `suspiciousApis` (`LoadLibraryA`, `GetACP`, `FreeEnvironmentStringsW`, FLS ×3, `CreateThread`): aí só **manual** ou evolução das regras.

Quando enviares um par **Fluxo (.json)** + **Resumo (.json)** de um caso conhecido (o mesmo cenário dos mapeamentos), a validação deixa de ser só conceptual e passa a ser **linha-a-linha** segundo o checklist do §4.
