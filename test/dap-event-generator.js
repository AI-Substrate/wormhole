/**
 * DAP Event Generator
 *
 * Simple script that continuously outputs events for testing DAP capture.
 * Run this in the debugger to generate predictable output events.
 */

async function main() {
    console.log('[START] Event generator beginning at:', new Date().toISOString());

    // Loop continuously, generating events every second
    for (let i = 1; i <= 1000; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`[EVENT ${i}] Timestamp:`, new Date().toISOString());

        // Optional: Log some object data every 5 events
        if (i % 5 === 0) {
            console.log(`[DATA] Event #${i}:`, {
                counter: i,
                timestamp: Date.now(),
                random: Math.random()
            });
        }

        // Throw an exception at event 10 to test exception capture
        if (i === 10) {
            console.log('[EXCEPTION] About to throw test exception...');
            const obj = null;
            obj.foo();  // TypeError: Cannot read property 'foo' of null
        }
    }

    console.log('[END] Event generator completing at:', new Date().toISOString());
}

main().catch(err => {
    console.error('[ERROR]', err);
    process.exit(1);
});
