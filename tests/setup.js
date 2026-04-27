// Runs before any test module is evaluated, ensuring SCHEMA_DIR is set
// before Generator's static property captures it from process.env.
process.env.SCHEMA_DIR = new URL('./fixtures', import.meta.url).pathname;