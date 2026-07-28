const VIEWPOINTS = Object.freeze([
  { field: 'self', label: 'Self' },
  { field: 'buddy', label: 'Buddy' },
  { field: 'command', label: 'Command' },
]);

export function createFourColorTooltipRows(point = {}) {
  return VIEWPOINTS.map(({ field, label }) => {
    const value = point[field];
    if (value === null || value === undefined) {
      return { field, label, value: null, source: 'ไม่มีข้อมูล' };
    }

    const prefix = field[0].toUpperCase() + field.slice(1);
    const carriedForward = point[`is${prefix}CF`] === true;
    const sourceDate = point[`${field}SourceDate`];
    return {
      field,
      label,
      value,
      source: carriedForward && sourceDate
        ? `CF จาก ${sourceDate}`
        : 'สังเกตจริง',
    };
  });
}
