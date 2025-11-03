FROM python:3.11-slim
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ai_worker/requirements.txt /app/requirements.txt
RUN pip install -r requirements.txt
COPY ai_worker /app
EXPOSE 8089
CMD ["python", "main.py"]
