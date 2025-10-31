# Setup Guide for WhatsApp Academic Manager

## Prerequisites
- Ensure you have the following installed:
  - Node.js (version X.X.X)
  - Docker (version X.X.X)
  - Git (version X.X.X)
  - Redis (version X.X.X)
  - A code editor (e.g., VSCode)

## Step-by-Step Installation

### Backend Installation
1. **Clone the Repository**
   ```bash
   git clone https://github.com/MahdyHQ/whatsapp-academic-manager.git
   cd whatsapp-academic-manager
   ```

2. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Run Backend Server**
   ```bash
   npm start
   ```

### Frontend Installation
1. **Navigate to Frontend Directory**
   ```bash
   cd frontend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Frontend Server**
   ```bash
   npm start
   ```

## Environment Configuration
- Create a `.env` file in the root directory and add the following variables:
  ```plaintext
  DATABASE_URL=your_database_url
  REDIS_URL=your_redis_url
  WHATSAPP_API_KEY=your_whatsapp_api_key
  ```

## Database Setup
1. **Install Database**
   - Use PostgreSQL, MySQL, or any preferred database.
   - Create a database named `whatsapp_academic_manager`.

2. **Run Migrations**
   ```bash
   npm run migrate
   ```

## Redis Configuration
1. **Install Redis**
   - Follow the installation guide for your operating system.

2. **Start Redis Server**
   ```bash
   redis-server
   ```

## WhatsApp Authentication
- Follow the [WhatsApp API documentation](https://www.whatsapp.com/business/api) to set up authentication and obtain your API key.

## AI Provider Setup
1. **Gemini**
   - Follow the setup instructions for Gemini API.

2. **OpenAI**
   - Create an account and obtain your API key.

3. **Claude**
   - Set up your Claude API key as per the documentation.

4. **Llama**
   - Follow Llama's API setup instructions.

5. **Mistral**
   - Obtain your Mistral API key and set it up.

## GitHub Codespaces Setup
1. **Create a Codespace**
   - Navigate to your repository on GitHub and click on the green "Code" button.
   - Select "Create Codespace on main".

2. **Install Dependencies**
   - Follow the same installation steps as above for both backend and frontend within the Codespace.

## Troubleshooting Common Issues
- Issue: "Port already in use"
  - Solution: Change the port number in the configuration file or terminate the process using that port.

- Issue: "Database connection failed"
  - Solution: Check the database URL and ensure the database server is running.

## Verification Steps
1. **Verify Backend**
   - Access the backend API using Postman or a similar tool.

2. **Verify Frontend**
   - Open your browser and navigate to `http://localhost:3000` to see the frontend.
