const UNREADABLE_DOCUMENT_ISSUE = Object.freeze({
  field: 'document',
  message: 'document could not be decoded',
});

export function decodeSnapshot(snapshot, decoder) {
  const records = [];
  const issues = [];
  const documents = Array.isArray(snapshot?.docs) ? snapshot.docs : [];

  for (const document of documents) {
    const documentId = typeof document?.id === 'string' ? document.id : '';

    try {
      const result = decoder({ documentId, data: document.data() });
      if (result.ok) {
        records.push(result.value);
      } else {
        issues.push({ documentId, issues: result.issues });
      }
    } catch {
      issues.push({ documentId, issues: [UNREADABLE_DOCUMENT_ISSUE] });
    }
  }

  return { records, issues };
}
