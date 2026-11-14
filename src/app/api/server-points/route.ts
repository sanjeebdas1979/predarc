// Keep the browser-facing path neutral: some endpoint filters block URLs that
// contain `/account` and replace the JSON response with an HTML warning page.
// The legacy route remains available for existing integrations.
export { GET, POST } from "../account/route";
