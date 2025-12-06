# Развертывание приложения через Docker

## Предварительные требования

- VPS сервер с Ubuntu 24
- Домен, направленный на IP-адрес сервера
- SSH доступ к серверу

## Быстрое развертывание (автоматический скрипт)

1. **Подключитесь к серверу:**
```bash
ssh root@ваш_ip_адрес
```

2. **Скачайте и запустите скрипт развертывания:**
```bash
curl -fsSL https://raw.githubusercontent.com/kondrashhhh/stars/master/deploy.sh -o deploy.sh
chmod +x deploy.sh
sudo ./deploy.sh
```

Скрипт автоматически:
- Установит Docker и Docker Compose
- Склонирует репозиторий
- Настроит Nginx
- Получит SSL сертификат
- Запустит приложение

## Ручное развертывание

### 1. Установка Docker

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Проверка установки
docker --version
docker-compose --version
```

### 2. Клонирование репозитория

```bash
cd /opt
sudo git clone https://github.com/kondrashhhh/stars.git
sudo chown -R $USER:$USER stars
cd stars
```

### 3. Настройка окружения

```bash
# Создайте .env файл
cp .env.example .env
nano .env
```

### 4. Настройка домена

Отредактируйте файл `nginx/conf.d/app.conf` и замените `ваш_домен.com` на ваш реальный домен:

```bash
nano nginx/conf.d/app.conf
```

### 5. Первый запуск (без SSL)

Временно закомментируйте SSL строки в `nginx/conf.d/app.conf`:

```bash
# Запустите приложение и Nginx
docker-compose up -d app nginx
```

### 6. Получение SSL сертификата

```bash
# Создайте директории для Certbot
mkdir -p certbot/conf certbot/www

# Получите SSL сертификат
docker-compose run --rm certbot certonly --webroot \
  --webroot-path /var/www/certbot \
  --email ваш_email@example.com \
  --agree-tos --no-eff-email \
  -d ваш_домен.com -d www.ваш_домен.com
```

### 7. Активация SSL

Раскомментируйте SSL строки в `nginx/conf.d/app.conf` и перезапустите Nginx:

```bash
docker-compose restart nginx
docker-compose up -d certbot
```

### 8. Настройка Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Управление приложением

### Основные команды

```bash
# Просмотр статуса контейнеров
docker-compose ps

# Просмотр логов
docker-compose logs -f

# Просмотр логов конкретного сервиса
docker-compose logs -f app

# Перезапуск приложения
docker-compose restart app

# Перезапуск всех сервисов
docker-compose restart

# Остановка всех сервисов
docker-compose down

# Запуск сервисов
docker-compose up -d
```

### Обновление приложения

```bash
cd /opt/stars
git pull
docker-compose up -d --build
```

### Очистка Docker

```bash
# Удаление неиспользуемых образов
docker system prune -a

# Удаление неиспользуемых volumes
docker volume prune
```

## Структура проекта

```
stars/
├── Dockerfile              # Конфигурация Docker образа
├── docker-compose.yml      # Оркестрация контейнеров
├── .dockerignore          # Исключения для Docker
├── .env.example           # Пример файла окружения
├── deploy.sh              # Автоматический скрипт развертывания
├── nginx/
│   ├── nginx.conf         # Основная конфигурация Nginx
│   └── conf.d/
│       └── app.conf       # Конфигурация сайта
├── certbot/
│   ├── conf/              # SSL сертификаты
│   └── www/               # Временные файлы Certbot
└── index.js               # Основное приложение
```

## Мониторинг

```bash
# Использование ресурсов контейнерами
docker stats

# Информация о контейнере
docker inspect stars-app
```

## Устранение неполадок

### Контейнер не запускается

```bash
# Проверьте логи
docker-compose logs app

# Проверьте конфигурацию
docker-compose config
```

### Проблемы с SSL

```bash
# Проверьте логи Certbot
docker-compose logs certbot

# Тест конфигурации Nginx
docker-compose exec nginx nginx -t

# Обновите сертификат вручную
docker-compose run --rm certbot renew
```

### Проблемы с доступом

```bash
# Проверьте, что порты открыты
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443

# Проверьте Firewall
sudo ufw status
```

## Бэкапы

### Создание бэкапа

```bash
# Бэкап данных приложения
tar -czf backup-$(date +%Y%m%d).tar.gz /opt/stars

# Бэкап SSL сертификатов
tar -czf ssl-backup-$(date +%Y%m%d).tar.gz /opt/stars/certbot/conf
```

## Производительность

- Приложение работает в режиме production
- Nginx выступает как reverse proxy и кеширует статические файлы
- SSL сертификаты обновляются автоматически каждые 12 часов
- Контейнеры автоматически перезапускаются при сбое

## Безопасность

- Используется SSL/TLS шифрование
- Firewall настроен на минимальный набор портов
- Docker контейнеры изолированы в отдельной сети
- Автоматическое обновление SSL сертификатов
