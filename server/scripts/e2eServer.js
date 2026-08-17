process.env.NODE_ENV = 'test'
process.env.CORS_ORIGIN = 'http://127.0.0.1:4173'

const http = require('http')
const express = require('express')
const mongoose = require('mongoose')
const { MongoMemoryReplSet } = require('mongodb-memory-server')
const app = require('../app')
const CookEvent = require('../models/CookEvent')

const API_HOST = '127.0.0.1'
const API_PORT = 5001
const CONTROL_PORT = 5002

let apiServer
let controlServer
let mongoServer
let shuttingDown = false

const listen = (server, port) =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, API_HOST, () => {
      server.off('error', reject)
      resolve()
    })
  })

const close = (server) =>
  server
    ? new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    : Promise.resolve()

const shutdown = async (signal, exitCode = 0) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`E2E harness received ${signal}; shutting down.`)

  const results = await Promise.allSettled([
    close(controlServer),
    close(apiServer),
  ])
  if (mongoose.connection.readyState !== 0) {
    results.push(await Promise.resolve(mongoose.disconnect()).then(
      () => ({ status: 'fulfilled' }),
      (reason) => ({ status: 'rejected', reason }),
    ))
  }
  if (mongoServer) {
    results.push(await Promise.resolve(mongoServer.stop()).then(
      () => ({ status: 'fulfilled' }),
      (reason) => ({ status: 'rejected', reason }),
    ))
  }

  const cleanupFailure = results.find((result) => result.status === 'rejected')
  if (cleanupFailure) {
    console.error('E2E harness cleanup failed:', cleanupFailure.reason)
    process.exitCode = 1
  } else {
    process.exitCode = exitCode
  }
}

const start = async () => {
  mongoServer = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
    },
  })
  await mongoose.connect(mongoServer.getUri(), { dbName: 'inventory-brew-e2e' })
  await CookEvent.init()

  const controlApp = express()
  controlApp.post('/reset', async (_req, res, next) => {
    try {
      await Promise.all(
        Object.values(mongoose.connection.collections).map((collection) =>
          collection.deleteMany({}),
        ),
      )
      res.json({ reset: true })
    } catch (error) {
      next(error)
    }
  })
  controlApp.use((error, _req, res, _next) => {
    console.error('E2E reset failed:', error)
    res.status(500).json({ error: 'E2E reset failed' })
  })

  apiServer = http.createServer(app)
  controlServer = http.createServer(controlApp)
  await Promise.all([
    listen(apiServer, API_PORT),
    listen(controlServer, CONTROL_PORT),
  ])
  console.log(`E2E API ready at http://${API_HOST}:${API_PORT}`)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

start().catch(async (error) => {
  console.error('E2E harness startup failed:', error)
  await shutdown('startup failure', 1)
})
