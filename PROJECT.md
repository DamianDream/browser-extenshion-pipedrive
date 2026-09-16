# Pipedrive Fields — Chrome Extension

## Обзор проекта
**Pipedrive Fields** — расширение для Google Chrome (Manifest V3), предназначенное для управления видимостью полей и секций в интерфейсе сделок (Deals) CRM Pipedrive (`*.pipedrive.com`).

Интерфейс Pipedrive построен с использованием виртуализации списков (React Virtuoso), из-за чего скрытие элементов требует синхронного вмешательства в жизненный цикл рендеринга (DOM MutationObserver) без задержек и с фиксацией геометрии.

---

## Архитектура и структура файлов

```
pipedrive-fields/
├── manifest.json        # Конфигурация Manifest V3 (permissions, content_scripts, side_panel/action)
├── background.js        # Service Worker (настройка side panel, переключение панелей, жизненный цикл)
├── content.js           # Контент-скрипт, внедряемый в страницы *.pipedrive.com
├── content.css          # Стили для мгновенного скрытия полей без скачков лейаута Virtuoso
├── sidepanel.html       # Основной UI (боковая панель Chrome Side Panel в стиле mySmart)
├── sidepanel.js         # Логика боковой панели (сканирование DOM, переключатели, хранилище, сброс)
├── sidepanel.css        # Тёмная glassmorphic-тема (Outfit, токены, свитчи, акценты)
├── popup.html           # (Fallback / Legacy) всплывающее окно
├── popup.js             # (Fallback / Legacy) логика попапа
├── popup.css            # (Fallback / Legacy) стили попапа
├── icons/               # Набор иконок (16, 32, 48, 128 px) с прозрачным фоном
├── sound/               # Звуковые эффекты (мяуканье при кликах)
├── video/               # Анимации загрузки (котик)
├── PROJECT.md           # Документация проекта и архитектура
└── TASKS.md             # Бэклог задач для разработчиков и агентов
```

---

## Ключевые механизмы и особенности реализации

### 1. Открытие через Chrome Side Panel (по образцу mySmart)
- **Механизм**: Расширение использует Chrome Side Panel API (`chrome.sidePanel`).
- **Поведение**: При клике по иконке расширения в тулбаре Chrome открывается нативная боковая панель справа от веб-страницы. В отличие от стандартного `popup`, боковая панель:
  - Не закрывается при взаимодействии с веб-страницей.
  - Позволяет в реальном времени переключать поля в боковой панели и сразу видеть результат в Pipedrive.
- **Background Worker (`background.js`)**:
  ```javascript
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  ```

### 2. Специфика DOM Pipedrive и Virtuoso (Решение проблемы скачков скролла)
- **Проблема**: Pipedrive использует виртуальный скролл (`react-virtuoso`). Если скрыть элемент через `display: none` асинхронно (например, через `setTimeout(..., 60)`), Virtuoso успевает рассчитать высоту строки (например, 200px) и сместить скролл на 199px при попытке скрыть строку постфактум.
- **Решение v1.0.21**:
  1. **Синхронность**: Обработка мутаций внутри `MutationObserver` выполняется строго синхронно (в микротаске) до того, как браузер выполнит фазы Layout и Paint.
  2. **Компактное скрытие (`content.css`)**:
     ```css
     .pdf-hidden-field {
       display: none !important;
       contain: strict !important;
       opacity: 0 !important;
       line-height: 0 !important;
       font-size: 0 !important;
       padding: 0 !important;
       margin: 0 !important;
       height: 0 !important;
       min-height: 0 !important;
       border: none !important;
       pointer-events: none !important;
     }
     ```
  3. **Запрет сброса необработанных элементов**: Скрипт не убирает класс `.pdf-hidden-field` у элементов, которые временно вышли из области видимости или еще не проверены, чтобы не провоцировать мигание строк.
  4. **Нормализация названий (`cleanLabel`)**: Удаляются технические счетчики вида `3/3 • 3`, что устраняет дублирование групп и полей.

### 3. Схема данных (chrome.storage.local)
```typescript
interface StorageData {
  fieldStates: {
    [fieldKey: string]: boolean; // true = показано, false = скрыто
  };
  groupStates: {
    [groupKey: string]: boolean; // состояние всей секции/группы
  };
  soundEnabled: boolean;         // включен ли звук мяуканья
}
```

### 4. Кнопка сброса с подтверждением
- **Иконка reload (красная)**: Находится в шапке панели.
- **Интерактивное состояние подтверждения**:
  - При нажатии на reload красная иконка заменяется на две кнопки:
    - `"Повернуть як було?"` — отмена сброса, возврат исходной кнопки.
    - `"Хай буде так!"` — подтверждение полного сброса всех правил видимости в дефолтное состояние (все поля видны).

---

## Важные правила для разработчиков и AI-агентов
1. **Никаких автоматических тестов (`test.cjs`)**: Пользователь тестирует расширение исключительно вручную на живой CRM. Не запускать скрипты автоматического тестирования.
2. **Абсолютная изоляция Vault**: Никогда не обращаться к директории `/Users/dima/Vault/dba-oauth` и ее потомкам.
3. **Не ломать синхронность `content.js`**: Любые асинхронные задержки (`setTimeout`, `requestAnimationFrame`) перед добавлением `.pdf-hidden-field` возвращают баг со скачками скролла в Virtuoso.
