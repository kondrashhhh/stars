# Используем официальный Node.js образ
FROM node:20-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --production

# Копируем остальные файлы приложения
COPY . .

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["node", "index.js"]
