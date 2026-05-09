import WikiBySlugClient from "./wiki-by-slug-client";

export default async function WikiBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const resolved = await params;
  return <WikiBySlugClient slug={resolved.slug} />;
}
