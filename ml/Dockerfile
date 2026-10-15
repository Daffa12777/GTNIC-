FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Validate using this image's sklearn. Rebuild incompatible/missing models from real UCI data.
# Model and simulator profiles must be exported together before building the full stack.
RUN python -W error::UserWarning -c "from app import model; model()" || (python train.py --download && python -W error::UserWarning -c "from app import model; model()")
ENV PORT=8100
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
