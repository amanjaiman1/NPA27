/**
 * A JSON-LD block. Rendered on the server, so it is in the initial HTML that
 * crawlers read. `<` is escaped so a string can never close the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
