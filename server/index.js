require('dotenv').config()
const http = require('http')
const mongoose = require('mongoose')
const app = require('./app')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/inventory-brew'
const PORT = Number(process.env.PORT) || 5000

let server

const startServer = async () => {
  try {
    await mongoose.connect(MONGO_URI)
    console.log('Connected to MongoDB')

    server = http.createServer(app)
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`)
    })
  } catch (err) {
    console.error('Startup failed:', err.message)
    process.exit(1)
  }
}

const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`)

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err)
          return resolve()
        })
      })
    }

    await mongoose.connection.close()
    console.log('Server and database connections closed.')
    process.exit(0)
  } catch (err) {
    console.error('Error during shutdown:', err.message)
    process.exit(1)
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  void shutdown('uncaughtException')
})

void startServer()
