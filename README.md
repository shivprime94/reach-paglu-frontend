# ScamGuard Browser Extension

A crowdsourced scam detection system for social media platforms. This extension alerts users when they're viewing a profile that has been reported as a potential scammer by the community.

## Features

- **Real-time alerts**: Get warned when visiting a Twitter/X or LinkedIn profile reported as suspicious
- **Community reporting**: Submit reports of suspicious accounts with evidence
- **Crowdsourced validation**: Uses the wisdom of the crowd to identify scammers
- **Simple interface**: Easy to use browser extension with minimal setup

## Project Structure

The project is divided into two main parts:
- **Extension**: Chrome/Edge extension files in the root directory
- **Backend**: Server files in the `/backend` directory

## Installation

### Extension Setup

1. Clone this repository
2. Open Chrome/Edge and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the extension directory (root folder)
5. The extension should now be installed and active

### Backend Setup

1. Make sure you have Node.js installed
2. Open terminal/command prompt in the **backend** directory:
   ```
   cd backend
   ```
3. Install dependencies: 
   ```
   npm install
   ```
4. Start the server: 
   ```
   npm start
   ```
5. The server will run on `http://localhost:3000` by default

## Usage

### Checking Accounts

- Simply browse Twitter/X or LinkedIn normally
- If you visit a profile that has been reported as a scammer (received enough votes to cross the threshold), a warning banner will appear at the top of the page
- You can click the extension icon to manually check any account

### Reporting Scammers

1. When viewing a suspicious profile, click the extension icon
2. Click "Report Account"
3. Fill in the details about why you believe this is a scammer
4. Submit the report
5. The community will vote on your report

## Development

### Extension Structure

- `manifest.json`: Extension configuration
- `content.js`: Content script that runs on Twitter/X and LinkedIn pages
- `background.js`: Background script for handling API requests
- `popup.html/js`: UI for the extension popup
- `styles.css`: Styling for the popup

### Backend Structure

- `backend/server.js`: Main server file with API endpoints
- `backend/data/`: Stores JSON files with reports and evidence

### Backend API Endpoints

- `GET /check/:platform/:accountId`: Check if an account is flagged as a scammer
- `POST /report`: Submit a new scam report
- `GET /evidence/:platform/:accountId`: Get all evidence for an account
- `GET /stats`: Get system statistics

## License

MIT
