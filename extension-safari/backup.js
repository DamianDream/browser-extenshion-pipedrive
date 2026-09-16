globalThis.PFBackup = (() => {
  function validate(data) {
    if (!data || data.format !== 'pipedrive-fields' || data.version !== 1 ||
        !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) {
      throw new Error('Неверный формат файла настроек.');
    }
    const entries = {};
    const items = Object.entries(data.entries);
    if (items.length > 20000) throw new Error('Слишком много записей.');
    for (const [id, value] of items) {
      if (id === 'pf-sound-enabled') {
        if (typeof value !== 'boolean') throw new Error('Некорректная настройка звука.');
        entries[id] = value;
        continue;
      }
      const match = /^(catalog|hidden):pf1:(.*)$/.exec(id);
      if (!match) throw new Error('Файл содержит неизвестные настройки.');
      let parts;
      try { parts = JSON.parse(match[2]); } catch { throw new Error('Повреждён идентификатор настройки.'); }
      if (!Array.isArray(parts) || parts.length !== 3) throw new Error('Повреждён идентификатор настройки.');
      const [host, group, field] = parts;
      if (typeof host !== 'string' || !/^(?:[a-z0-9-]+\.)*pipedrive\.com$/.test(host) ||
          typeof group !== 'string' || !group || group.length > 2000 ||
          (field !== null && (typeof field !== 'string' || !field || field.length > 2000)) ||
          PF.key(host, group, field) !== 'pf1:' + match[2]) throw new Error('Некорректная группа, поле или адрес сайта.');
      if (match[1] === 'hidden') {
        if (typeof value !== 'boolean') throw new Error('Некорректное значение переключателя.');
        entries[id] = value;
      } else {
        if (!value || value.host !== host || typeof value.group !== 'string' ||
            value.group.length > 2000 || PF.normalize(value.group) !== group ||
            (field === null ? value.field !== null : typeof value.field !== 'string' ||
              value.field.length > 2000 || PF.normalize(value.field) !== field)) {
          throw new Error('Повреждён каталог полей.');
        }
        entries[id] = {host, group: value.group, field: value.field};
      }
    }
    return entries;
  }
  function create(state) {
    const data = {format: 'pipedrive-fields', version: 1, exportedAt: new Date().toISOString(),
      entries: Object.fromEntries(Object.entries(state).filter(([id]) => id === 'pf-sound-enabled' || /^(catalog|hidden):pf1:/.test(id)))};
    validate(data);
    return data;
  }
  return {validate, create};
})();
