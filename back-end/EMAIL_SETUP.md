# Email Setup Guide

## Required Environment Variables

To enable email functionality (welcome emails and collaboration invites), you need to set the following environment variables:

### 1. Create a `.env` file in the `back-end` directory:

```bash
# Database Configuration
MONGO_URI=mongodb://localhost:27017/your_database_name
MONGO_DB=your_database_name

# Email Configuration (Resend)
RESEND_API_KEY=your_resend_api_key_here
RESEND_FROM_EMAIL=noreply@yourdomain.com

# App Configuration
APP_NAME=DrawBoard
SUPPORT_EMAIL=support@yourdomain.com
NODE_ENV=development

# Client Configuration
CLIENT_ORIGIN=http://localhost:3000

# Server Configuration
PORT=5000
```

### 2. Get a Resend API Key

1. Go to [resend.com](https://resend.com) and create an account
2. Verify your domain or use the sandbox domain for testing
3. Generate an API key from your dashboard
4. Add the API key to your `.env` file

### 3. Verify Email Domain

Make sure your `RESEND_FROM_EMAIL` domain is verified in Resend, or use the sandbox domain for testing.

## Testing Email Functionality

1. Start the backend server
2. Create a new user account (sign up with Google/GitHub)
3. Check the console logs for email attempts
4. If emails are not sending, check that `RESEND_API_KEY` is set correctly

## Fallback Behavior

If email configuration is missing:

- Welcome emails will be logged to console instead of sent
- Collaboration invites will be logged to console instead of sent
- The application will continue to work normally
