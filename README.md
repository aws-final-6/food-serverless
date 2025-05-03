# Serverless Recipe Management System with OAuth Authentication

A serverless application that provides recipe management and user authentication through multiple OAuth providers (Google, Naver, Kakao). The system offers personalized recipe recommendations, bookmark functionality, ingredient tracking, and subscription-based features using AWS Lambda and MySQL.

The application consists of two main components: a Node.js-based Lambda service for handling user interactions and recipe management, and a Python-based Lambda service for subscription management. It provides a comprehensive API for managing user profiles, recipes, bookmarks, and refrigerator contents while supporting multiple authentication methods for secure access.

## Repository Structure
```
.
├── serverless-nodejs-lambda/           # Main application service
│   ├── lambda/                        # Lambda function implementations
│   │   ├── auth/                      # OAuth authentication handlers
│   │   ├── bookmark/                  # Recipe bookmark management
│   │   ├── mypage/                    # User profile management
│   │   ├── recipe/                    # Recipe search and retrieval
│   │   ├── refrig/                    # Refrigerator management
│   │   ├── search/                    # Search functionality
│   │   └── searchfilter/             # Search filtering
│   ├── utils/                         # Shared utility functions
│   └── package.json                   # Node.js dependencies
└── serverless-subscription-lambda/     # Subscription management service
    └── mlr-prd-lam-db-pkg/           # Python Lambda package
        ├── lambda_function.py         # Main subscription handler
        └── pymysql/                   # MySQL database connector
```

## Usage Instructions
### Prerequisites
- Node.js 14.x or later
- Python 3.7 or later
- AWS CLI configured with appropriate permissions
- MySQL database instance
- OAuth credentials for Google, Naver, and Kakao

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd <repository-name>
```

2. Install Node.js dependencies:
```bash
cd serverless-nodejs-lambda
npm install
```

3. Install Python dependencies:
```bash
cd ../serverless-subscription-lambda
pip install -r requirements.txt
```

4. Configure environment variables:
```bash
# Create .env file in serverless-nodejs-lambda
cp .env.example .env
# Edit .env with your configuration
```

### Quick Start

1. Deploy the Node.js Lambda functions:
```bash
cd serverless-nodejs-lambda
serverless deploy
```

2. Deploy the Python subscription Lambda:
```bash
cd ../serverless-subscription-lambda
serverless deploy
```

### More Detailed Examples

1. Authenticate a user:
```javascript
// Request OAuth token
const response = await fetch('/auth/requestToken', {
  method: 'POST',
  body: JSON.stringify({ provider: 'google' })
});
```

2. Search for recipes:
```javascript
// Search by title
const recipes = await fetch('/search/getTitleSearchList', {
  method: 'POST',
  body: JSON.stringify({ keyword: 'pasta' })
});
```

### Troubleshooting

1. Authentication Issues
- Error: "Invalid OAuth token"
  - Check if OAuth credentials are properly configured
  - Verify token expiration
  - Ensure correct provider is specified

2. Database Connection Issues
- Error: "Cannot connect to database"
  - Verify database credentials
  - Check network connectivity
  - Ensure proper security group configuration

## Data Flow
The application processes user requests through API Gateway, authenticates via OAuth providers, and interacts with a MySQL database for data persistence.

```ascii
User -> API Gateway -> Lambda Functions -> MySQL
  ^          |              |
  |          v              v
  +---- OAuth Providers  AWS SQS
```

Key component interactions:
1. User requests are routed through API Gateway
2. Lambda functions handle authentication and business logic
3. OAuth providers verify user identity
4. MySQL stores user data, recipes, and preferences
5. SQS manages subscription notifications