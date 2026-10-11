FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Jika artefak model belum di-commit, latih dari data demo agar layanan tetap hidup (UI akan memberi peringatan).
RUN [ -f artifacts/model.joblib ] || python train.py --demo
ENV PORT=8100
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
