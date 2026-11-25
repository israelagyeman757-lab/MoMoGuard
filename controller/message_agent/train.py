"""Train the SMS classifier: TF-IDF (word 1-2 grams) + Logistic Regression.

Run: python -m controller.message_agent.train
Saves model.joblib next to this module. Trains in seconds on the small
hand-written set; retrain on the organisers' labelled data after the sandbox.
"""

from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from controller.message_agent.dataset import DATASET

MODEL_PATH = Path(__file__).parent / "model.joblib"


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)),
        ("clf", LogisticRegression(max_iter=1000, C=5.0)),
    ])


def train() -> Pipeline:
    texts = [t for t, _ in DATASET]
    labels = [1 if lab == "scam" else 0 for _, lab in DATASET]
    model = build_pipeline()
    model.fit(texts, labels)
    joblib.dump(model, MODEL_PATH)
    return model


if __name__ == "__main__":
    model = train()
    texts = [t for t, _ in DATASET]
    labels = [1 if lab == "scam" else 0 for _, lab in DATASET]
    acc = model.score(texts, labels)
    print(f"Trained on {len(texts)} hand-written messages (simulated dataset).")
    print(f"Training accuracy: {acc:.2f} — NOT evidence of real-world performance.")
    print(f"Saved: {MODEL_PATH}")