// Bundle entry point: tracing must start before the API loads instrumented modules.
import './observability/tracing';
import './server';
