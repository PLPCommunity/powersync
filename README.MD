# POWERSYNC TOOL

**Real-time Collaborative Whiteboard**  
A web-based whiteboard that lets distributed teams draw, write, and brainstorm together in real time. Built with React.js, Tailwind CSS, Node.js, Socket.io, and MongoDB.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Installation](#installation)
   - [Running Locally](#running-locally)
4. [Usage](#usage)
5. [Project Structure](#project-structure)
6. [API Endpoints](#api-endpoints)
7. [Real-Time Events](#real-time-events)
8. [Configuration](#configuration)
9. [Roadmap](#roadmap)
10. [Contributing](#contributing)
11. [License](#license)

---

## Features

- **Canvas Drawing Tools**: Freehand pen, shapes, text boxes, color picker, undo/redo
- **Real-Time Sync**: Instant broadcast of drawing actions via Socket.io
- **Presence Indicators**: See who’s online and watch live cursors
- **Session Management**: Create, join, and manage boards with unique URLs and access codes
- **Export & Share**: Download boards as PNG, SVG, or PDF; share via link/embed
- **User Authentication**: Email/password or OAuth; role-based access control
- **Action History**: Persisted action log for replay, undo/redo, and versioning
- **Optional Chat & Comments**: Side-panel messaging and pinned discussions

---

## Tech Stack

- **Frontend**
  - React.js + Typescript
  - Tailwind CSS
  - Socket.io-client
- **Backend**
  - Node.js & Express
  - Socket.io-server
  - MongoDB (Mongoose)
- **Dev Tools**
  - ESLint + Prettier
  - Jest (unit tests)

---

## Getting Started

### Prerequisites

- Node.js v16+
- MongoDB (local or Atlas)

### Installation

```bash
# Clone the repo
git clone https://github.com/PLPCommunity/powersync.git
cd powersync

# Install frontend dependencies
cd front-end
yarn

# Run frontend
yarn dev

# Install backend dependencies
cd ../back-end
yarn

# Run Backend
nodemon server.js


```
