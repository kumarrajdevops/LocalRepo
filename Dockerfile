FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Run the typescript compiler
RUN npm run build

EXPOSE 3002

CMD ["npm", "start"]

