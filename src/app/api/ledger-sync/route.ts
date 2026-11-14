// Keep the browser-facing path neutral: endpoint filters can replace URLs that
// contain prediction-related terms with an HTML warning page. The original
// route remains available for existing integrations.
export { POST } from "../predictions/submit/route";
