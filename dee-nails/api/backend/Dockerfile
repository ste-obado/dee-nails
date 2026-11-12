FROM python:3.12-slim

WORKDIR /app

# system deps needed to build mysqlclient-style wheels / bcrypt on slim images
# Install system dependencies
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' \
    /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=3 update \
    && apt-get install -y --no-install-recommends \
        gcc \
        default-libmysqlclient-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Run migrations, then start the API. If the migration fails, the
# container fails to start instead of silently serving against a
# schema that's out of date.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
