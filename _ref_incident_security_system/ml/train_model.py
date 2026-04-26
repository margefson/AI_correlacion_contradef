"""\nTreinamento do Modelo de Classificação de Incidentes de Segurança\nPipeline: TF-IDF + Naive Bayes (MultinomialNB)\nDataset: incidentes_cybersecurity_2000.xlsx (2000 amostras)\nCategorias: phishing, malware, brute_force, ddos, vazamento_de_dados\n"""

import os
import sys
import json
import joblib
import pandas as pd
from datetime import datetime, timezone
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import classification_report, accuracy_score

# ─── Caminhos ────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(SCRIPT_DIR, "incidentes_cybersecurity_2000.xlsx")
MODEL_PATH = os.path.join(SCRIPT_DIR, "model.pkl")
METRICS_PATH = os.path.join(SCRIPT_DIR, "metrics.json")

# ─── Carregar Dataset ─────────────────────────────────────────────────────────
print("[ML] Carregando dataset...")
df = pd.read_excel(DATASET_PATH)
print(f"[ML] Dataset carregado: {len(df)} amostras")
print(f"[ML] Colunas encontradas: {list(df.columns)}")

# Normalizar nomes de colunas (suporte a português e inglês)
col_map = {}
for col in df.columns:
    col_lower = col.lower().strip()
    if col_lower in ("title", "titulo", "título"):
        col_map["title"] = col
    elif col_lower in ("description", "descricao", "descrição"):
        col_map["description"] = col
    elif col_lower in ("category", "categoria"):
        col_map["category"] = col

print(f"[ML] Mapeamento de colunas: {col_map}")
title_col = col_map.get("title", df.columns[0])
desc_col = col_map.get("description", df.columns[1])
cat_col = col_map.get("category", df.columns[2])

print(f"[ML] Distribuição de categorias:\n{df[cat_col].value_counts()}")

# ─── Pré-processamento ────────────────────────────────────────────────────────
df["text"] = df[title_col].fillna("") + " " + df[desc_col].fillna("")
df["text"] = df["text"].str.lower().str.strip()

X = df["text"]
# Normalizar categorias: espaços → underscores (brute force → brute_force)
y = df[cat_col].str.lower().str.strip().str.replace(" ", "_", regex=False)

# ─── Pipeline TF-IDF + Naive Bayes ───────────────────────────────────────────
# Passo 2: TF-IDF (recomendado no documento)
# Passo 3: MultinomialNB (recomendado: TF-IDF + Naive Bayes)
pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(
        ngram_range=(1, 2),       # unigrams + bigrams
        max_features=10000,        # aumentado para 2000 amostras
        sublinear_tf=True,         # aplicar log(tf) para normalização
        min_df=2,                  # mínimo de 2 documentos para vocabulário maior
        analyzer="word",
        strip_accents="unicode",
    )),
    ("clf", MultinomialNB(alpha=0.5)),  # suavização Laplace
])

# ─── Avaliação com Cross-Validation ──────────────────────────────────────────
print("\n[ML] Avaliando com cross-validation (5-fold)...")
cv_scores = cross_val_score(pipeline, X, y, cv=5, scoring="accuracy")
print(f"[ML] Acurácia CV: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

# ─── Treinar no Dataset Completo ─────────────────────────────────────────────
print("\n[ML] Treinando modelo no dataset completo...")
pipeline.fit(X, y)

# Avaliação no conjunto de treino
y_pred_train = pipeline.predict(X)
train_accuracy = accuracy_score(y, y_pred_train)
print(f"[ML] Acurácia no treino: {train_accuracy:.4f}")
print("\n[ML] Relatório de classificação:")
print(classification_report(y, y_pred_train))

# ─── Salvar Modelo ────────────────────────────────────────────────────────────
print(f"\n[ML] Salvando modelo em {MODEL_PATH}...")
joblib.dump(pipeline, MODEL_PATH)

# ─── Salvar Métricas ──────────────────────────────────────────────────────────
metrics = {
    "method": "TF-IDF + Naive Bayes (MultinomialNB)",
    "dataset_size": len(df),
    "categories": list(y.unique()),
    "cv_accuracy_mean": float(cv_scores.mean()),
    "cv_accuracy_std": float(cv_scores.std()),
    "train_accuracy": float(train_accuracy),
    "category_distribution": y.value_counts().to_dict(),
    "last_updated": datetime.now(timezone.utc).isoformat(),
}
with open(METRICS_PATH, "w", encoding="utf-8") as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)

print(f"[ML] Métricas salvas em {METRICS_PATH}")
print("\n[ML] Treinamento concluído com sucesso!")

# ─── Teste Rápido ─────────────────────────────────────────────────────────────
test_cases = [
    ("Mensagem suspeita de atualização de senha", "Usuários receberam e-mail dizendo que a conta seria bloqueada caso não acessassem um link para confirmar credenciais."),
    ("Arquivo suspeito executado na máquina", "Um colaborador abriu um anexo recebido por e-mail e o antivírus detectou comportamento malicioso no computador."),
    ("Múltiplas tentativas de login", "O sistema registrou dezenas de falhas consecutivas de autenticação para a mesma conta em poucos minutos."),
    ("Serviço ficou indisponível após pico de tráfego", "O portal passou a responder lentamente e depois ficou fora do ar após grande volume de requisições simultâneas."),
    ("Planilha enviada ao destinatário incorreto", "Um arquivo contendo dados de clientes foi compartilhado por engano com uma pessoa não autorizada."),
]

print("\n[ML] Testando predições:")
for title, desc in test_cases:
    text = f"{title} {desc}".lower()
    pred = pipeline.predict([text])[0]
    proba = pipeline.predict_proba([text])[0]
    confidence = max(proba)
    print(f"  '{title[:40]}...' → {pred} (confiança: {confidence:.2%})")
