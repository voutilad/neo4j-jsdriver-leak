const neo4j = require('neo4j-driver').v1

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687'
const USER = process.env.NEO4J_USER || 'neo4j'
const PASSWORD = process.env.NEO4J_PASSWORD || 'password'
const BATCHSIZE = process.env.NEO4J_BATCH || 1000
const LOGLEVEL = process.env.NEO4J_LOGLEVEL || 'debug'

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD),
			    {
			      encrypted: false,
			      logging: neo4j.logging.console(LOGLEVEL),
			    })

// Peek inside the given driver and see how many Connections are "open"
function countOpenConns(driver) {
  let cnt = 0
  if (driver._pool == null || driver._pool._pools == null)
    return 0

  for (key in driver._pool._pools) {
    for (conn in driver._pool._pools[key]) {
      cnt += driver._pool._pools[key][conn]._ch._open ? 1 : 0
    }
  }
  return cnt
}

let openSessions = 0
let queryCnt = 0

// This mimics some of the behavior in neo4j-graphql-js
// See: https://github.com/neo4j-graphql/neo4j-graphql-js/blob/master/src/index.js#L128-L140
async function query(driver, database) {
  let result
  let session = driver.session()
  try {
    openSessions++
    result = await session.run('RETURN 1')
  } finally {
    session.close(() => openSessions--)
  }
  return result.records.map(() => queryCnt++)
}

// Concurrently queue up a bunch of queries
function leak(driver, database, times=BATCHSIZE) {
  let results = []
  for (let i=0; i<times; i++) {
    results.push(query(driver, database))
  }
  Promise.all(results).then(() => {
    console.log(`${(new Date()).toLocaleTimeString()} finished batch of ${times}`)
  })
}

timer = setInterval(() => {
  console.log(`${(new Date()).toLocaleTimeString()} open connections: ${countOpenConns(driver)}, open sessions: ${openSessions}, query count: ${queryCnt}`)
  if (openSessions == 0) {
    leak(driver)
  }
}, 1000)

process.on('SIGINT', () => {
  console.log(`closing connections...`)
  timer.close()
  driver.close()
  let countdown = 0
  setInterval(() => {
    if (--countdown < 1 || openSessions == 0) {
      process.exit(1)
    }
  }, 500)
})
