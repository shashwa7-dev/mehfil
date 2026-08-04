/**
 * Mehfil song reports -> Google Sheet.
 *
 * Paste this whole file into Extensions > Apps Script on a new Sheet, then
 * Deploy > New deployment > Web app, with:
 *
 *   Execute as:      Me
 *   Who has access:  Anyone
 *
 * "Anyone" is required because our server calls this with no Google identity.
 * That is also why the deployment URL must never reach the browser: anybody
 * holding it can append rows. It goes in Vercel as FEEDBACK_WEBHOOK_URL and is
 * used only by /api/feedback, which validates every report before forwarding.
 *
 * HEADERS must match the field names /api/feedback sends, in order. Adding a
 * field there means adding it here; anything missing arrives as a blank cell
 * rather than shifting the row.
 */

const HEADERS = [
  'at',                // ISO timestamp, set on our server
  'kind',              // 'wrong-track' | 'missing-song'
  'songId',            // catalogue id, for looking the song back up
  'songTitle',
  'songFilm',
  'currentVideoId',    // what was playing when it was reported as wrong
  'suggestedVideoId',  // extracted id — this is what the pipeline consumes
  'suggestedUrl',      // the link as pasted, so a bad parse is visible
  'note',
  'reporterName',      // blank when they would rather not be credited
  'userAgent',
];

// Ids are text. Without this Sheets reads "-Al-S1uishM" as a formula and
// "3gADoivNR-U" as something to reformat, and the id you need is destroyed.
const TEXT_COLUMNS = ['suggestedVideoId', 'currentVideoId', 'songId'];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'empty request' });
    }

    const report = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // The first write lays down the header, so the sheet can start empty and
    // nobody has to type eleven column names correctly.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow(
      HEADERS.map(function (key) {
        const value = report[key];
        if (value === undefined || value === null || value === '') {
          return '';
        }
        return TEXT_COLUMNS.indexOf(key) === -1 ? value : "'" + value;
      })
    );

    return json({ ok: true });
  } catch (err) {
    // Reported back rather than swallowed: /api/feedback logs a non-ok reply,
    // so a broken deployment shows up in the logs instead of looking like
    // reports that were never sent.
    return json({ ok: false, error: String(err) });
  }
}

/** A GET is not how reports arrive; answering one confirms the deployment. */
function doGet() {
  return json({ ok: true, message: 'Mehfil feedback endpoint is deployed.' });
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
