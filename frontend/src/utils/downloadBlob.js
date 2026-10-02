import client from '../api/client';

// Shared by every admin panel that downloads an auth-protected file
// (assets invoices, party invoices, onboarding ID documents, manifests, box
// booking invoices) — these were 5 byte-identical copies of the same
// fetch-as-blob-and-save dance.
export async function downloadBlob(url, filename) {
  const { data } = await client.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
