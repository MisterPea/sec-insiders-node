import { parentPort } from 'worker_threads';
import Database from 'better-sqlite3';
import path, { dirname } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath( import.meta.url );
const __dirname = dirname( __filename );

const dbPath = path.join( __dirname, '../../sqlite/sec_data.db' );

const db = new Database( dbPath );
db.pragma( 'journal_mode = WAL' );
db.pragma( 'synchronous = NORMAL' );
db.pragma( 'busy_timeout = 3000' );

// Init schema
const schema = fs.readFileSync( path.join( __dirname, '../../schemas/schema.sql' ), 'utf-8' );
db.exec( schema );

parentPort.on( 'message', async ( message ) => {
  const { id, type, sql, params } = message;
  try {
    const stmt = db.prepare( sql );
    let result;
    if ( type === 'get' ) {
      result = stmt.get( ...params );
    }
    else if ( type === 'get_all' ) {
      result = stmt.all( ...params );
    }
    else if ( type === 'set' ) {
      stmt.bind( ...params ).run();
      result = { set: params.length };
    } else if ( type === 'insert' ) {
      let recordsInserted = 0;
      const insertMany = db.transaction( ( rows ) => {
        for ( const paramSet of rows ) {
          const rows = stmt.run( ...paramSet );
          // keep track of num row inserted per iteration
          recordsInserted += rows.changes;
        }
      } );
      insertMany( params );
      result = { inserted: recordsInserted };
    }

    parentPort.postMessage( { id, result } );
  } catch ( error ) {
    console.error( 'SQLite bind error:', error.message );
    console.error( 'Params:', params );
    // console.error( 'Param types:', Object.entries( params ).map( ( [k, v] ) => [k, typeof v, v] ) );
    parentPort.postMessage( { id, error: error.message } );
  }
} );