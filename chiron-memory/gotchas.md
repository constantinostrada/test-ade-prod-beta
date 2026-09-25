# gotcha

A non-obvious pitfall or trap, learned the hard way.

## Test server in-flight counters must decrement on response close

What: The instrumented test server decrements its in-flight counter on res "close", not when it writes a response · Why: a client that times out (the /hang test) leaves the request counted forever, inflating the max-in-flight measured by later tests on the same server · Where: test/server.ts · Learned: count in-flight requests by connection lifecycle, not by handler completion
