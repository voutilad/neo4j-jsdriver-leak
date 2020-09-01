const neo4j = require('neo4j-driver')

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687'
const USER = process.env.NEO4J_USER || 'neo4j'
const PASSWORD = process.env.NEO4J_PASSWORD || 'password'
const DB = process.env.NEO4J_DBNAME || false
const BATCHSIZE = process.env.NEO4J_BATCH || 1000
const LOGLEVEL = process.env.NEO4J_LOGLEVEL || 'debug'

const driver = neo4j.driver(URI,
			    neo4j.auth.basic(USER, PASSWORD),
			    { logging: neo4j.logging.console(LOGLEVEL) })

// Peek inside the given driver and see how many Connections are "open"
function countOpenConns(driver) {
  let cnt = 0
  if (driver._connectionProvider == null)
    return 0

  for (conn in driver._connectionProvider._openConnections) {
    cnt += driver._connectionProvider._openConnections[conn]._ch._open ? 1 : 0
  }
  return cnt
}

let openSessions = 0

// This mimics some of the behavior in neo4j-graphql-js
// See: https://github.com/neo4j-graphql/neo4j-graphql-js/blob/master/src/index.js#L128-L140
async function query(driver, database=false) {
  let result
  let session = database ? driver.session({ database }) : driver.session()
  try {
    openSessions++
    result = await session.run('RETURN 1')
  } finally {
    session.close()
      .then(() => openSessions--)
  }
  return result.records.map(() => {})
}

// Concurrently queue up a bunch of queries
function leak(driver, database=false, times=500) {
  let results = []
  for (let i=0; i<times; i++) {
    results.push(query(driver, database))
  }
  Promise.all(results).then(() => {
    console.log(`${(new Date()).toLocaleTimeString()} finished batch of ${times}`)
  })
}

setInterval(() => {
  console.log(`${(new Date()).toLocaleTimeString()} open connections: ${countOpenConns(driver)}, open sessions: ${openSessions}`)
  if (openSessions == 0) {
    leak(driver, DB, BATCHSIZE)
  }
}, 1000)
