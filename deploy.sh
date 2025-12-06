#!/bin/bash

# Скрипт для развертывания приложения на VPS через Docker

echo "🚀 Начинаем развертывание приложения..."

# Обновление системы
echo "📦 Обновление системы..."
sudo apt update && sudo apt upgrade -y

# Установка Docker
echo "🐳 Установка Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "✅ Docker установлен"
else
    echo "✅ Docker уже установлен"
fi

# Установка Docker Compose
echo "🐳 Установка Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose установлен"
else
    echo "✅ Docker Compose уже установлен"
fi

# Установка Git
echo "📥 Установка Git..."
if ! command -v git &> /dev/null; then
    sudo apt install -y git
    echo "✅ Git установлен"
else
    echo "✅ Git уже установлен"
fi

# Клонирование репозитория
echo "📂 Клонирование репозитория..."
cd /opt
if [ ! -d "stars" ]; then
    sudo git clone https://github.com/kondrashhhh/stars.git
    sudo chown -R $USER:$USER stars
    echo "✅ Репозиторий склонирован"
else
    echo "⚠️  Директория stars уже существует"
    cd stars
    git pull
    echo "✅ Репозиторий обновлен"
fi

cd /opt/stars

# Создание .env файла
if [ ! -f ".env" ]; then
    echo "📝 Создание .env файла..."
    cp .env.example .env
    echo "⚠️  Не забудьте настроить .env файл!"
fi

# Запрос домена
read -p "Введите ваш домен (например, example.com): " DOMAIN
if [ ! -z "$DOMAIN" ]; then
    echo "🔧 Настройка домена: $DOMAIN"
    sed -i "s/ваш_домен.com/$DOMAIN/g" nginx/conf.d/app.conf
fi

# Создание директорий для SSL
mkdir -p certbot/conf certbot/www

# Временная конфигурация Nginx для получения SSL
echo "🔧 Создание временной конфигурации Nginx..."
cat > nginx/conf.d/app.conf.temp << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

# Временно используем конфигурацию без SSL
cp nginx/conf.d/app.conf nginx/conf.d/app.conf.backup
cp nginx/conf.d/app.conf.temp nginx/conf.d/app.conf

# Запуск контейнеров
echo "🚀 Запуск Docker контейнеров..."
docker-compose up -d app nginx

# Получение SSL сертификата
if [ ! -z "$DOMAIN" ]; then
    echo "🔒 Получение SSL сертификата..."
    docker-compose run --rm certbot certonly --webroot --webroot-path /var/www/certbot \
        --email admin@$DOMAIN --agree-tos --no-eff-email \
        -d $DOMAIN -d www.$DOMAIN
    
    # Восстанавливаем конфигурацию с SSL
    if [ -f "certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
        echo "✅ SSL сертификат получен"
        cp nginx/conf.d/app.conf.backup nginx/conf.d/app.conf
        docker-compose restart nginx
    else
        echo "⚠️  Не удалось получить SSL сертификат. Проверьте DNS настройки."
    fi
fi

# Запуск Certbot для автообновления
docker-compose up -d certbot

# Настройка Firewall
echo "🔥 Настройка Firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "✅ Развертывание завершено!"
echo ""
echo "📋 Полезные команды:"
echo "  Просмотр логов:        docker-compose logs -f"
echo "  Перезапуск:           docker-compose restart"
echo "  Остановка:            docker-compose down"
echo "  Обновление:           git pull && docker-compose up -d --build"
echo ""
echo "🌐 Ваше приложение доступно по адресу: http://$DOMAIN"
