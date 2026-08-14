// Переупорядочивание блоков чека: чистая утилита без сетевых вызовов.
// Общая для настроек клиентского чека и кухонного чека (2 потребителя).
// Поведение сохранено байт-в-байт из прежних локальных копий в страницах.
export function moveBlock(blocks, block, direction) {
  const index = blocks.indexOf(block);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return blocks;
  const next = [...blocks];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}
