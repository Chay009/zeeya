import type { Token } from './types';

// ── Trie ─────────────────────────────────────────────────────────────────────

class GenTrie {
  child = false;
  leaf = false;
  token = '';
  next: Map<string, GenTrie> = new Map();
}

type RootTrie = Map<string, GenTrie>;

// ── FsaContextMap ─────────────────────────────────────────────────────────────

const DT_D = 'd';
const DT_DD = 'dd';
const DT_MM = 'MM';
const DT_MMM = 'MMM';
const DT_YY = 'yy';
const DT_YYYY = 'yyyy';
const DT_HH = 'HH';
const DT_mm = 'mm';
const DT_ss = 'ss';
const TY_NUM = 'NUM';
const TY_TAGNUM = 'TAGNUM';
const TY_AMT = 'AMT';
const TY_PCT = 'PCT';
const TY_DST = 'DST';
const TY_WGT = 'WGT';
const TY_ACC = 'INSTRNO';
const TY_TYP = 'TYP';
const TY_RATE = 'RATE';
const TY_DTE = 'DATE';
const TY_TME = 'TIME';
const TY_TMS = 'TIMES';
const TY_TMERANGE = 'TIMERANGE';
const TY_NUMRANGE = 'NUMRANGE';
const TY_STR = 'STR';
const TY_PHN = 'PHN';
const TY_OTP = 'OTP';
const TY_DTA = 'DATA';
const TY_MLT = 'MLTPL';
const TY_VPD = 'VPD';
const TY_USSD = 'USSD';
const TY_NUM_MINS = 'NUM_MINS';
const TY_DTERANGE = 'DATERANGE';
const TY_CALLFORWARD = 'CALLFORWARD';
const INDEX_KEY = 'INDEX';

const CH_NLINE = 10;
const CH_SPACE = 32;
const CH_EXCL = 33;
const CH_HASH = 35;
const CH_PCT = 37;
const CH_SQOT = 39;
const CH_LBKT = 40;
const CH_RBKT = 41;
const CH_STAR = 42;
const CH_PLUS = 43;
const CH_COMA = 44;
const CH_HYPH = 45;
const CH_FSTP = 46;
const CH_SLSH = 47;
const CH_COLN = 58;
const CH_LSBT = 91;
const CH_UNSC = 95;
const CH_ATRT = 64;

const YUGA_SOURCE_CONTEXT = 'YUGA_SOURCE_CONTEXT';
const YUGA_SC_CURR = 'YUGA_SC_CURR';
const YUGA_SC_ON = 'YUGA_SC_ON';
const YUGA_SC_TMERANGE = 'YUGA_SC_TMERANGE';
const YUGA_SC_TRANSID = 'YUGA_SC_TRANSID';
const YUGA_SC_TRANS = 'YUGA_SC_TRANS';
const YUGA_CONF_DATE = 'YUGA_CONF_DATE';

const FSA_MONTHS_SEED = 'jan;uary,feb;r;uary,mar;ch,apr;il,may,jun;e,jul;y,aug;ust,sep;t;ember,oct;ober,nov;ember,dec;ember';
const FSA_DAYS_SEED = 'sun;day,mon;day,tue;sday,wed;nesday,thu;rsday,thur;sday,fri;day,sat;urday';
const FSA_DAYRANGE_SEED = 'day;s,work days,working days,business days';
const FSA_TIMEPRFX_SEED = 'at,on,before,by';
const FSA_AMT_SEED = 'lac,lakh,k';
const FSA_TIMES_SEED = 'hours,hrs,hr,mins,minutes';
const FSA_TZ_SEED = 'gmt,ist';
const FSA_DAYSFFX_SEED = 'st,nd,rd,th';
const FSA_UPI_SEED = 'UPI,MMT,NEFT';

const CURR_ACT = ['rs', 'inr', 'cny', 'ngn', 'usd', 'cad', 'eur', 'gbp', 'aed', 'jpy', 'aud', 's$', 'lkr', 'ksh', 'egp'];

class FsaContextMap {
  private _map: Map<string, string> = new Map();
  private _valMap: Map<string, string> = new Map();
  private prevKey = '';
  private keys: string[] = [];

  contains(key: string) { return this._map.has(key); }
  size() { return this._map.size; }

  put(key: string, value: string | number) {
    const s = String(value);
    if (!this.keys.includes(key)) this.keys.push(key);
    this._map.set(key, s);
    this.prevKey = key;
  }

  putChar(key: string, ch: string) { this.put(key, ch); }

  getType(): string { return this._map.get(TY_TYP) ?? ''; }

  setType(type: string, convertType?: string | null) {
    this._map.set(TY_TYP, type);
    if (convertType != null) this._convertAll(convertType);
  }

  setVal(name: string, val: string) { this._valMap.set(name, val); }
  getVal(name: string) { return this._valMap.get(name); }
  getValMap() { return this._valMap; }
  getIndex() { return parseInt(this._map.get(INDEX_KEY) ?? '0'); }
  setIndex(index: number) { this._map.set(INDEX_KEY, String(index)); }

  append(value: string) {
    const prev = this._map.get(this.prevKey) ?? '';
    this.put(this.prevKey, prev + value);
  }

  containsAllDateContexts() {
    return this._map.has(DT_D) && this._map.has(DT_MM) &&
      (this._map.has(DT_YY) || this._map.has(DT_YYYY));
  }

  pop(): string {
    const prev = this._map.get(this.prevKey) ?? '';
    const ret = prev.charAt(prev.length - 1);
    this.put(this.prevKey, prev.slice(0, -1));
    return ret;
  }

  convert(kOld: string, kNew: string) {
    if (this._map.has(kOld)) {
      const v = this._map.get(kOld)!;
      this._map.delete(kOld);
      const idx = this.keys.indexOf(kOld);
      if (idx >= 0) this.keys.splice(idx, 1);
      if (!this._map.has(kNew)) {
        this.put(kNew, v);
      } else {
        this.put(kNew, this._map.get(kNew)! + v);
      }
      this.prevKey = kNew;
    }
  }

  private _convertAll(k: string) {
    let sb = '';
    for (const key of this.keys) {
      sb += this._map.get(key) ?? '';
      this._map.delete(key);
    }
    this.keys = [];
    this.put(k, sb);
  }

  remove(key: string) {
    this._map.delete(key);
    const idx = this.keys.indexOf(key);
    if (idx >= 0) this.keys.splice(idx, 1);
  }

  get(key: string) { return this._map.get(key); }

  upgrade(value: string) {
    switch (this.prevKey) {
      case DT_HH: this.put(DT_mm, value); this.prevKey = DT_mm; break;
      case DT_mm: this.put(DT_ss, value); this.prevKey = DT_ss; break;
      case DT_D:  this.put(DT_MM, value); this.prevKey = DT_MM; break;
      case DT_MM:
      case DT_MMM: this.put(DT_YY, value); this.prevKey = DT_YY; break;
      case DT_YY: {
        const old = this._map.get(DT_YY) ?? '';
        this._map.delete(DT_YY);
        const idx = this.keys.indexOf(DT_YY);
        if (idx >= 0) this.keys.splice(idx, 1);
        this.put(DT_YYYY, old + value);
        this.prevKey = DT_YYYY;
        break;
      }
    }
  }

  putAll(other: FsaContextMap) {
    other._map.forEach((v, k) => {
      if (!this.keys.includes(k)) this.keys.push(k);
      this._map.set(k, v);
    });
    other._valMap.forEach((v, k) => this._valMap.set(k, v));
  }

  getDate(config: Map<string, string>): Date | null {
    try {
      let year: number | null = null;
      let month: number | null = null; // 1-based
      let day: number | null = null;
      let hour = 0, min = 0, sec = 0;
      let hasTime = false;

      if (this._map.has(DT_YYYY)) year = parseInt(this._map.get(DT_YYYY)!);
      else if (this._map.has(DT_YY)) {
        const y = parseInt(this._map.get(DT_YY)!);
        year = y < 70 ? 2000 + y : 1900 + y;
      }

      if (this._map.has(DT_MM)) month = parseInt(this._map.get(DT_MM)!);
      else if (this._map.has(DT_MMM)) {
        const mname = this._map.get(DT_MMM)!.toLowerCase();
        const mi = ['january','february','march','april','may','june','july','august','september','october','november','december'].findIndex(m => mname.startsWith(m.slice(0,3)));
        if (mi >= 0) month = mi + 1;
      }

      if (this._map.has(DT_D)) day = parseInt(this._map.get(DT_D)!);
      else if (this._map.has(DT_DD)) {
        // DT_DD may hold a weekday name (e.g. "monday") from FSA_DAYS match — parseInt gives NaN; skip it
        const parsed = parseInt(this._map.get(DT_DD)!);
        if (!isNaN(parsed)) day = parsed;
      }

      if (this._map.has(DT_HH)) { hour = parseInt(this._map.get(DT_HH)!); hasTime = true; }
      if (this._map.has(DT_mm)) { min = parseInt(this._map.get(DT_mm)!); hasTime = true; }
      if (this._map.has(DT_ss)) sec = parseInt(this._map.get(DT_ss)!);

      const confDate = config.get(YUGA_CONF_DATE);
      if (year == null && confDate) year = parseInt(confDate.split('-')[0]);
      if (month == null && confDate) month = parseInt(confDate.split('-')[1]);
      if (day == null && confDate) day = parseInt(confDate.split('-')[2]);

      if (year == null || month == null || day == null) return null;
      // Month-swap: if month > 12 but day <= 12 and year is present, try DD/MM order (US-format dates)
      if (month > 12 && day != null && day <= 12 && (this._map.has(DT_YY) || this._map.has(DT_YYYY))) {
        const tmp = month; month = day; day = tmp;
      }
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      if (year < 1970 || year > 2099) return null;

      const d = new Date(year, month - 1, day, hour, min, sec);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
}

// ── Trie seeding ──────────────────────────────────────────────────────────────

function seeding(seed: string, root: GenTrie) {
  for (const word of seed.split(',')) {
    let t = root;
    const len = word.length;
    for (let i = 0; i < len; i++) {
      const ch = word[i];
      t.child = true;
      if (!t.next.has(ch)) t.next.set(ch, new GenTrie());
      t = t.next.get(ch)!;
      if (i === len - 1) {
        t.leaf = true;
        t.token = word.replace(/;/g, '');
      } else if (i < len - 1 && word.charCodeAt(i + 1) === 59) { // semicolon
        t.leaf = true;
        t.token = word.replace(/;/g, '');
        i++; // skip semicolon
      }
    }
  }
}

function createRoot(): RootTrie {
  const root: RootTrie = new Map();
  const keys = ['FSA_MONTHS', 'FSA_DAYS', 'FSA_TIMEPRFX', 'FSA_AMT', 'FSA_TIMES', 'FSA_TZ', 'FSA_DAYSFFX', 'FSA_UPI', 'FSA_DAYRANGE'];
  for (const k of keys) root.set(k, new GenTrie());
  seeding(FSA_MONTHS_SEED, root.get('FSA_MONTHS')!);
  seeding(FSA_DAYS_SEED, root.get('FSA_DAYS')!);
  seeding(FSA_TIMEPRFX_SEED, root.get('FSA_TIMEPRFX')!);
  seeding(FSA_AMT_SEED, root.get('FSA_AMT')!);
  seeding(FSA_TIMES_SEED, root.get('FSA_TIMES')!);
  seeding(FSA_TZ_SEED, root.get('FSA_TZ')!);
  seeding(FSA_DAYSFFX_SEED, root.get('FSA_DAYSFFX')!);
  seeding(FSA_UPI_SEED, root.get('FSA_UPI')!);
  seeding(FSA_DAYRANGE_SEED, root.get('FSA_DAYRANGE')!);
  return root;
}

const ROOT: RootTrie = createRoot();

// ── Util helpers ──────────────────────────────────────────────────────────────

function isNum(c: string) { const n = c.charCodeAt(0); return n >= 48 && n <= 57; }
function isNumStr(s: string) { return s.length > 0 && [...s].every(isNum); }
function isDateOp(c: string) { const n = c.charCodeAt(0); return n === CH_SLSH || n === CH_HYPH || n === CH_SPACE; }
function isDelimiter(c: string) {
  const n = c.charCodeAt(0);
  return n === CH_SPACE || n === CH_FSTP || n === CH_COMA || n === CH_RBKT || n === CH_NLINE;
}
function isTimeOp(c: string) { return c.charCodeAt(0) === CH_COLN; }
function isAlpha(c: string) { const n = c.charCodeAt(0); return (n >= 65 && n <= 90) || (n >= 97 && n <= 122); }
function isLowerAlpha(c: string) { const n = c.charCodeAt(0); return n >= 97 && n <= 122; }
function isUpperAlpha(c: string) { const n = c.charCodeAt(0); return n >= 65 && n <= 90; }

function isTypeEnd(ch: string) {
  const n = ch.charCodeAt(0);
  return isNum(ch) || n === CH_FSTP || n === CH_SPACE || n === CH_HYPH || n === CH_COMA ||
    n === CH_SLSH || n === CH_RBKT || n === CH_EXCL || n === CH_PLUS || n === CH_STAR ||
    ch === '\r' || ch === '\n' || ch === "'";
}

function checkTypes(root: RootTrie, type: string, word: string): [number, string] | null {
  const trie = root.get(type);
  if (!trie) return null;
  let t = trie;
  let i = 0;
  for (; i < word.length; i++) {
    const ch = word[i];
    if (t.leaf && !t.next.has(ch) && isTypeEnd(ch))
      return [i - 1, t.token];
    if (t.child && t.next.has(ch)) {
      t = t.next.get(ch)!;
    } else break;
  }
  if (t.leaf && i === word.length) return [i - 1, t.token];
  return null;
}

function meridienTimeAhead(str: string, i: number): boolean {
  if (i + 1 >= str.length) return false;
  const c0 = str[i], c1 = str[i + 1];
  if (!((c0 === 'a' || c0 === 'p') && c1 === 'm')) return false;
  if (i + 2 >= str.length) return true;
  const c2 = str[i + 2];
  return c2 === ' ' || c2 === '.' || c2 === ',' || c2 === ')' || c2 === '-' || c2 === '\n' || c2 === '\r';
}

function hrsTimeAhead(str: string, i: number): boolean {
  if (i + 1 >= str.length || str[i] !== 'h' || str[i + 1] !== 'r') return false;
  let j = i + 2;
  if (j >= str.length) return true;
  if (str[j] === 's') j++;
  if (j >= str.length) return true;
  const c = str[j];
  return c === ' ' || c === '.' || c === ',' || c === ')' || c === '-' || c === '\n';
}

function possibleTimeAhead(str: string, i: number): boolean {
  if (i >= str.length) return false;
  const c = str[i];
  return c === ' ' && (meridienTimeAhead(str, i + 1) || hrsTimeAhead(str, i + 1));
}

function isInstrNumStart(c: string) {
  const n = c.charCodeAt(0);
  return n === 42 || n === 88 || n === 120; // * X x
}

const ISD_CODES = new Set(['+91', '+1', '+254', '+46', '+234']);
function hasISDCodePrefix(str: string, i: number): boolean {
  if (i >= str.length) return false;
  const prefix = str.substring(0, i);
  return ISD_CODES.has(prefix) || ISD_CODES.has('+' + prefix);
}

function checkForTimeRange(val: string): boolean {
  if (!val || !isNumStr(val) || val.length < 7) return false;
  const fromH = parseInt(val.substring(0, 2));
  const toH = parseInt(val.substring(4, 6));
  return fromH < 24 && toH < 24;
}

function lookAheadForInstr(str: string, index: number): number {
  for (let i = index; i < str.length; i++) {
    const n = str.charCodeAt(i);
    if (n === CH_FSTP) continue;
    else if (n === 42 || n === 88 || n === 120 || isNum(str[i])) return i;
    else return -1;
  }
  return -1;
}

function lookAheadForNum(str: string, index: number): number {
  for (let i = index + 1; i < str.length; i++) {
    const c = str[i];
    if (c === ' ') continue;
    else if (isNum(c)) return i - 1;
    else return -1;
  }
  return -1;
}

function lookAheadForMerid(str: string, index: number): boolean {
  if (index + 4 >= str.length) return false;
  for (let i = index + 1; i < index + 4; i++)
    if (meridienTimeAhead(str, i)) return true;
  return false;
}

function nextSpace(str: string): number {
  let i = 0;
  while (i < str.length && str[i] !== ' ') i++;
  return i;
}

function getAmt(type: string): string {
  if (type === 'lakh' || type === 'lac') return '00000';
  if (type === 'k') return '000';
  return '';
}

function isCurrencyAhead(type: string): boolean {
  const s = getPotentialCurrString(type).toLowerCase();
  return CURR_ACT.includes(s);
}

function getPotentialCurrString(type: string): string {
  return type.substring(0, nextSpace(type));
}

function parseStrToInt(text: string): number | null {
  if (!text || text.length === 0 || text.length > 9) return null;
  const n = parseInt(text, 10);
  return isNaN(n) ? null : n;
}

function checkForNumRange(val: string): boolean {
  if (!val || val.length < 3 || !val.includes('-') || val.startsWith('00')) return false;
  const parts = val.split('-');
  if (parts.length !== 2) return false;
  if (parts[0].length === 0 || parts[0].length > 6 || parts[1].length === 0 || parts[1].length > 6) return false;
  const lengthOk = parts[1].length >= parts[0].length && (parts[1].length - parts[0].length) < 2;
  const a = parseStrToInt(parts[0]);
  const b = parseStrToInt(parts[1]);
  if (!isNumStr(parts[0]) || !isNumStr(parts[1]) || a == null || b == null) return false;
  return lengthOk && (b - a) > 0;
}

function skip(str: string): number {
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    if (c === ' ' || c === ',' || c === '(' || c === ':') i++;
    else break;
  }
  return i;
}

function extractTime(str: string, valMap: Map<string, string>, prefix = '') {
  const pre = prefix ? prefix + '_' : '';
  const m = str.match(/(\d{2})(\d{2})?(\d{2})?/);
  if (m) {
    valMap.set(pre + 'time', m[1] + (m[2] ? ':' + m[2] : ':00'));
  }
}

function configContextIsCURR(config: Map<string, string>): boolean {
  return config.get(YUGA_SOURCE_CONTEXT) === YUGA_SC_CURR;
}

function getPrevState(prevStates: number[]): number {
  const idx = prevStates.length - 2;
  return idx < 0 ? 1 : prevStates[idx];
}

function isHour(c1: string, c2: string): boolean {
  return ((c1 === '0' || c1 === '1') && isNum(c2)) ||
    (c1 === '2' && (c2 === '0' || c2 === '1' || c2 === '2' || c2 === '3' || c2 === '4'));
}

function handleTYTMS(map: FsaContextMap, v: string | undefined): boolean {
  if (!v || v.length !== 8 || !isHour(v[0], v[1]) || !isHour(v[4], v[5])) return false;
  extractTime(v.substring(0, 4), map.getValMap(), 'from');
  extractTime(v.substring(4, 8), map.getValMap(), 'to');
  return true;
}

function checkIfData(str: string, j: number, map: FsaContextMap) {
  map.setVal('data', map.get(map.getType()) ?? '');
  let sData = '';
  switch (str[j]) {
    case 'k': map.setVal('data_type', 'KB'); sData = ' KB'; break;
    case 'm': map.setVal('data_type', 'MB'); sData = ' MB'; break;
    case 'g': map.setVal('data_type', 'GB'); sData = ' GB'; break;
  }
  map.setType(TY_DTA, TY_DTA);
  map.append(sData);
}

function setIfNumRange(str: string, i: number, map: FsaContextMap) {
  if (!str || i < 0 || i > str.length) return;
  let trimmed = str.substring(0, i).trim();
  if (!trimmed) return;
  if (isDelimiter(trimmed[trimmed.length - 1]))
    trimmed = trimmed.slice(0, -1);
  if (checkForNumRange(trimmed) && map.getType() !== TY_TMS) {
    const parts = trimmed.split('-');
    map.setVal('from_num', parts[0]);
    map.setVal('to_num', parts[1]);
    map.setType(TY_NUMRANGE);
  }
}

function skipForTZ(str: string, map: FsaContextMap): number {
  let state = 1, i = 0;
  while (state > 0 && i < str.length) {
    const c = str[i];
    const n = c.charCodeAt(0);
    switch (state) {
      case 1:
        if (n === CH_SPACE || n === CH_PLUS || isNum(c)) state = 1;
        else if (n === CH_COLN) state = 2;
        else {
          const s_ = str.substring(0, i).trim();
          if (s_.length === 4 && isNumStr(s_)) { map.put(DT_YYYY, s_); state = -2; }
          else state = -1;
        }
        break;
      case 2: state = isNum(c) ? 3 : -1; break;
      case 3: state = isNum(c) ? 4 : -1; break;
      case 4: state = n === CH_SPACE ? 5 : -2; break;
      case 5: {
        if (i + 3 < str.length) {
          const sy = str.substring(i, i + 4);
          if (isNumStr(sy)) { map.put(DT_YYYY, sy); i += 3; }
        }
        state = -2;
        break;
      }
    }
    i++;
  }
  const s_ = str.substring(0, i).trim();
  if (state === 1 && s_.length === 4 && isNumStr(s_)) map.put(DT_YYYY, s_);
  return state === -1 ? 0 : i;
}

// ── DelimiterStack ────────────────────────────────────────────────────────────

class DelimiterStack {
  private stack: string[] = [];
  push(ch: string) { this.stack.push(ch); }
  pop(): string {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : '~';
  }
}

// ── accAmtNumPct helper ───────────────────────────────────────────────────────

function accAmtNumPct(
  str: string, i: number, map: FsaContextMap,
  config: Map<string, string>
): number {
  const c = str[i];
  const n = c.charCodeAt(0);
  const subStr = str.substring(i);
  let p: [number, string] | null;

  if (n === CH_FSTP) {
    if (i === 0 && configContextIsCURR(config)) map.setType(TY_AMT, TY_AMT);
    map.append(c);
    return 10;
  } else if (n === CH_STAR && subStr.length > 10 && i + 1 < str.length &&
    str.charCodeAt(i + 1) !== CH_STAR && nextSpace(subStr) - i > 12) {
    // call forward – simplified, skip
    return -1;
  } else if (isInstrNumStart(c) && lookAheadForInstr(str, i + 2) !== -1) {
    map.setType(TY_ACC, TY_ACC);
    map.append('X');
    return 11;
  } else if (n === CH_COMA) {
    return 12;
  } else if (n === CH_PCT || (n === CH_SPACE && i + 1 < str.length && str.charCodeAt(i + 1) === CH_PCT)) {
    map.setType(TY_PCT, TY_PCT);
    return -1;
  } else if (n === CH_PLUS) {
    if (configContextIsCURR(config)) return -1;
    map.setType(TY_STR, TY_STR);
    return 36;
  } else if (i > 0 && (p = checkTypes(ROOT, 'FSA_AMT', subStr)) !== null) {
    map.setIndex(p[0]);
    map.setType(TY_AMT, TY_AMT);
    map.append(getAmt(p[1]));
    return 38;
  } else if (i > 0 && (p = checkTypes(ROOT, 'FSA_TIMES', subStr)) !== null) {
    const ind = i + p[0];
    map.setIndex(ind);
    map.setType(TY_TME, undefined as any);
    let s = str.substring(0, i);
    if (p[1] === 'mins') s = '00' + s;
    extractTime(s, map.getValMap());
    return 38;
  }
  return -1;
}

// ── Response ──────────────────────────────────────────────────────────────────

interface YugaResponse {
  type: string;
  str: string;
  valMap: Map<string, string>;
  index: number;
  hasTime?: boolean; // true when DATE has time components
}

// ── parseInternal ─────────────────────────────────────────────────────────────

function parseInternal(str: string, config: Map<string, string>): [number, FsaContextMap] | null {
  let state = 1, i = 0, comma_count = 1;
  let haveSeenAComma = false;
  let p: [number, string] | null;
  let map = new FsaContextMap();
  const delimiterStack = new DelimiterStack();
  str = str.toLowerCase();
  let counter = 0, insi: number;
  const prevStates: number[] = [1];

  while (state > 0 && i < str.length && i >= 0) {
    const c = str[i];
    const cn = c.charCodeAt(0);
    if (prevStates[prevStates.length - 1] !== state) prevStates.push(state);

    switch (state) {
      case 1:
        if (isNum(c)) {
          map.setType(TY_NUM, undefined as any);
          map.put(TY_NUM, c); state = 2;
        } else if ((p = checkTypes(ROOT, 'FSA_MONTHS', str.substring(i))) !== null) {
          map.setType(TY_DTE, undefined as any);
          map.put(DT_MMM, p[1]); i += p[0]; state = 33;
        } else if ((p = checkTypes(ROOT, 'FSA_DAYS', str.substring(i))) !== null) {
          map.setType(TY_DTE, undefined as any);
          map.put(DT_DD, p[1]); i += p[0]; state = 30;
        } else if (cn === CH_HYPH) {
          state = 37;
        } else if (cn === CH_LSBT) {
          state = 1;
        } else {
          state = accAmtNumPct(str, i, map, config);
          if (map.getType() == null) return null;
          if (state === -1 && map.getType() === TY_CALLFORWARD) i = map.getIndex();
          else if (state === -1 && map.getType() !== TY_PCT) i = i - 1;
        }
        break;

      case 2:
        if (isNum(c)) { map.append(c); state = 3; }
        else if (isTimeOp(c)) { delimiterStack.push(c); map.setType(TY_DTE, DT_HH); state = 4; }
        else if (isDateOp(c) || cn === CH_COMA) {
          if (cn === CH_SPACE && meridienTimeAhead(str, i + 1)) {
            map.setType(TY_DTE, DT_HH); map.put(DT_mm, '00'); state = 7;
          } else {
            delimiterStack.push(c); map.setType(TY_DTE, DT_D); state = 16;
          }
        } else if ((p = checkTypes(ROOT, 'FSA_MONTHS', str.substring(i))) !== null) {
          map.setType(TY_DTE, DT_D); map.put(DT_MMM, p[1]); i += p[0]; state = 24;
        } else if (meridienTimeAhead(str, i)) {
          map.setType(TY_DTE, DT_HH); map.put(DT_mm, '00'); i--; state = 7;
        } else {
          state = accAmtNumPct(str, i, map, config);
          if (state === -1 && map.getType() !== TY_PCT) i = i - 1;
        }
        break;

      case 3:
        if (isNum(c)) { map.append(c); state = 8; }
        else if (cn === CH_SPACE && hasISDCodePrefix(str, i)) { /* stay 3 */ }
        else if (cn === CH_SPACE && i === str.length - 1) { state = -1; }
        else if (isTimeOp(c)) { delimiterStack.push(c); map.setType(TY_DTE, DT_HH); state = 4; }
        else if ((isDateOp(c) && !configContextIsCURR(config)) || cn === CH_COMA) {
          if (cn === CH_COMA) haveSeenAComma = true;
          if (cn === CH_SPACE && meridienTimeAhead(str, i + 1)) {
            map.setType(TY_DTE, DT_HH); map.put(DT_mm, '00'); state = 7;
          } else {
            delimiterStack.push(c); map.setType(TY_DTE, DT_D); state = 16;
          }
        } else if ((p = checkTypes(ROOT, 'FSA_MONTHS', str.substring(i))) !== null) {
          map.setType(TY_DTE, DT_D); map.put(DT_MMM, p[1]); i += p[0]; state = 24;
        } else if (meridienTimeAhead(str, i)) {
          map.setType(TY_DTE, DT_HH); map.put(DT_mm, '00'); i--; state = 7;
        } else if ((p = checkTypes(ROOT, 'FSA_DAYSFFX', str.substring(i))) !== null) {
          map.setType(TY_DTE, DT_D); i += p[0]; state = 32;
        } else {
          state = accAmtNumPct(str, i, map, config);
          if (state === -1 && map.getType() !== TY_PCT) i = i - 1;
        }
        break;

      case 4:
        if (isNum(c)) { map.upgrade(c); state = 5; }
        else {
          if (!map.contains(DT_MMM)) map.setType(TY_NUM, TY_NUM);
          i = i - 2; state = -1;
        }
        break;

      case 5:
        if (isNum(c)) { map.append(c); }
        else if (cn === CH_COLN) { state = 6; break; }
        else if (c === 'a' && i + 1 < str.length && str[i + 1] === 'm') { i++; state = -1; break; }
        else if (c === 'p' && i + 1 < str.length && str[i + 1] === 'm') {
          const hh = parseInt(map.get(DT_HH) ?? '0');
          map.put(DT_HH, String(hh + 12)); i++; state = -1; break;
        } else if ((p = checkTypes(ROOT, 'FSA_TIMES', str.substring(i))) !== null) {
          i += p[0]; state = -1; break;
        } else { state = 7; break; }
        break;

      case 6:
        if (isNum(c)) {
          map.upgrade(c);
          if (i + 1 < str.length && isNum(str[i + 1])) map.append(str[i + 1]);
          i++; state = -1;
        } else state = -1;
        break;

      case 7:
        if (c === 'a' && i + 1 < str.length && str[i + 1] === 'm') {
          i++;
          const hh = parseInt(map.get(DT_HH) ?? '12');
          if (hh === 12) map.put(DT_HH, '0');
        } else if (c === 'p' && i + 1 < str.length && str[i + 1] === 'm') {
          const hh = parseInt(map.get(DT_HH) ?? '0');
          if (hh < 12) map.put(DT_HH, String(hh + 12));
          i++;
        } else if ((p = checkTypes(ROOT, 'FSA_TIMES', str.substring(i))) !== null) {
          i += p[0];
        } else {
          i = i - 2;
        }
        state = -1;
        break;

      case 8:
        if (isNum(c)) { map.append(c); state = 9; }
        else {
          state = accAmtNumPct(str, i, map, config);
          if (cn === CH_SPACE && state === -1 && i + 1 < str.length && isNum(str[i + 1]) && !configContextIsCURR(config))
            state = 12;
          else if (cn === CH_HYPH && state === -1 && i + 1 < str.length && isNum(str[i + 1]) && !configContextIsCURR(config))
            state = 45;
          else if (state === -1 && map.getType() !== TY_PCT) i = i - 1;
          else if (cn === CH_COMA) delimiterStack.push(c);
        }
        break;

      case 9:
        if (isDateOp(c) && !configContextIsCURR(config)) {
          delimiterStack.push(c); state = 25;
        } else if (isNum(c)) {
          map.append(c); counter = 5; state = 15;
        } else {
          if (cn === CH_COMA) delimiterStack.push(c);
          state = accAmtNumPct(str, i, map, config);
          if (state === -1 && map.getType() !== TY_PCT) i = i - 1;
        }
        break;

      case 10:
        if (isNum(c)) { map.append(c); map.setType(TY_AMT, TY_AMT); state = 14; }
        else { map.pop(); i = i - 2; state = -1; }
        break;

      case 11:
        if (cn === 42 || cn === 88 || cn === 120) map.append('X');
        else if (cn === CH_HYPH) state = 11;
        else if (isNum(c)) { map.append(c); state = 13; }
        else if (cn === CH_SPACE && i + 1 < str.length &&
          (str.charCodeAt(i + 1) === 42 || str.charCodeAt(i + 1) === 88 ||
           str.charCodeAt(i + 1) === 120 || isNum(str[i + 1])))
          state = 11;
        else if (cn === CH_FSTP && (insi = lookAheadForInstr(str, i)) > 0) {
          for (let x = insi - i; x > 0; x--) map.append('X');
          i = isNum(str[insi]) ? insi - 1 : insi;
        } else { i = i - 1; state = -1; }
        break;

      case 12: {
        if (isNum(c)) {
          if ((i > 2 && str[i - 1] === ' ' && isNum(str[i - 2])) || delimiterStack.pop() === '/') {
            map.append(c);
            if (map.contains('NUM')) counter = (map.get('NUM') ?? '').length;
            state = 15;
          } else {
            map.setType(TY_AMT, TY_AMT); map.append(c);
          }
        } else if (cn === CH_COMA) { comma_count++; }
        else if (cn === CH_FSTP) { map.append(c); state = 10; }
        else if (cn === CH_HYPH && i + 1 < str.length && isNum(str[i + 1])) { state = 39; }
        else if (getPrevState(prevStates) === 37 && cn === CH_HYPH &&
          (p = checkTypes(ROOT, 'FSA_MONTHS', str.substring(i + 1))) !== null) {
          i = -1; map = new FsaContextMap(); str = str.substring(1); state = 1;
        } else if (cn === CH_SPACE && lookAheadForNum(str, i) !== -1) {
          if (delimiterStack.pop() === ',') state = -1;
          else state = 15;
        } else {
          if (i - 1 > 0 && str[i - 1] === ',') i = i - 2;
          else if (i - 3 > 0 && str[i - 3] === ',' && comma_count === 1) {
            const c1 = map.pop(); const c2 = map.pop();
            map.append('.'); map.append(c2); map.append(c1);
          } else i = i - 1;
          if (comma_count > 1 && comma_count < 4 && map.getType() === TY_AMT)
            map.setType(TY_NUM, TY_NUM);
          else if (comma_count >= 4 && map.getType() === TY_AMT) {
            map.remove(map.getType()); map.remove('TYP');
          }
          state = -1;
        }
        break;
      }

      case 13:
        if (isNum(c)) map.append(c);
        else if (cn === 42 || cn === 88 || cn === 120) map.append('X');
        else if (cn === CH_FSTP && configContextIsCURR(config)) {
          map.setType(TY_AMT, TY_AMT);
          map.put(TY_AMT, (map.get(TY_AMT) ?? '').replace(/X/g, ''));
          map.append(c); state = 10;
        } else if (cn === CH_FSTP && (insi = lookAheadForInstr(str, i)) > 0) {
          for (let x = insi - i; x > 0; x--) map.append('X');
          i = isNum(str[insi]) ? insi - 1 : insi;
        } else if (cn === CH_HASH && (i === str.length - 1 || (i + 1 < str.length && isDelimiter(str[i + 1])))) {
          map.setType(TY_USSD);
        } else { i = i - 1; state = -1; }
        break;

      case 14:
        if (isNum(c)) map.append(c);
        else if (map.get(TY_AMT) != null && (map.get(TY_AMT) ?? '').includes('.') && possibleTimeAhead(str, i)) {
          const samt = map.get(TY_AMT) ?? '';
          const parts = samt.split('.');
          map.put(DT_HH, parts[0]); map.put(DT_mm, parts[1]);
          map.setType(TY_DTE); state = 7;
        } else if (cn === CH_PCT) {
          map.setType(TY_PCT, TY_PCT); state = -1;
        } else if ((c === 'k' || c === 'c') && i + 1 < str.length && str[i + 1] === 'm') {
          map.setType(TY_DST, TY_DST); i++; state = -1;
        } else if ((c === 'k' || c === 'm') && i + 1 < str.length && str[i + 1] === 'g') {
          map.setType(TY_WGT, TY_WGT); i++; state = -1;
        } else {
          if (cn === CH_FSTP && i + 1 < str.length && isNum(str[i + 1])) {
            const samt = map.get(map.getType()) ?? '';
            if (samt.includes('.')) {
              const parts = samt.split('.');
              if (parts.length === 2) {
                const d = parseStrToInt(parts[0]), mm = parseStrToInt(parts[1]);
                if (d != null && mm != null && d <= 31 && mm <= 12) {
                  map.setType(TY_DTE);
                  map.put(DT_D, parts[0]); map.put(DT_MM, parts[1]);
                  state = 19; break;
                }
              }
            }
          }
          i = i - 1; state = -1;
        }
        break;

      case 15:
        if (isNum(c)) { counter++; map.append(c); }
        else if (cn === CH_COMA && counter < 10) { delimiterStack.push(c); state = 12; }
        else if (cn === CH_FSTP) { map.append(c); state = 10; }
        else if ((cn === 42 || cn === 88 || cn === 120) && i + 1 < str.length &&
          (isNum(str[i + 1]) || str.charCodeAt(i + 1) === CH_HYPH ||
           str.charCodeAt(i + 1) === 42 || str.charCodeAt(i + 1) === 88 || str.charCodeAt(i + 1) === 120)) {
          map.setType(TY_ACC, TY_ACC); map.append('X'); state = 11;
        } else if (cn === CH_SPACE && counter >= 5 && counter < 10 && !configContextIsCURR(config) &&
          i + 2 < str.length && isNum(str[i + 1]) && isNum(str[i + 2])) {
          state = 41;
        } else { i = i - 1; state = -1; }
        break;

      case 16:
        if (isNum(c)) { map.upgrade(c); state = 17; }
        else if (cn === CH_SPACE || cn === CH_COMA) { /* stay 16 */ }
        else if ((p = checkTypes(ROOT, 'FSA_MONTHS', str.substring(i))) !== null) {
          map.put(DT_MMM, p[1]); i += p[0]; state = 24;
        } else if (cn === CH_FSTP) {
          map.setType(TY_NUM, TY_NUM); map.append(c); state = 10;
        } else if (i > 0 && (p = checkTypes(ROOT, 'FSA_TIMES', str.substring(i))) !== null) {
          map.setType(TY_TME, undefined as any);
          let s = str.substring(0, i);
          if (p[1] === 'mins' || p[1] === 'minutes') s = '00' + s;
          extractTime(s, map.getValMap()); i += p[0]; state = -1;
        } else {
          if (delimiterStack.pop() === ' ' && cn === CH_HYPH && i + 1 < str.length &&
            (isNum(str[i + 1]) || checkTypes(ROOT, 'FSA_MONTHS', str.substring(i + 1)) !== null)) {
            // stay 16
          } else {
            map.setType(TY_NUM, TY_NUM);
            let j = i;
            while (j >= 0 && j < str.length && !isNum(str[j])) j--;
            i = j; state = -1;
          }
        }
        break;

      case 17:
        if (isNum(c)) { map.append(c); state = 18; }
        else if (isDateOp(c)) { delimiterStack.push(c); state = 19; }
        else if (cn === CH_COMA && delimiterStack.pop() === ',') { map.setType(TY_NUM, TY_NUM); state = 12; }
        else if (cn === CH_FSTP && delimiterStack.pop() === ',') { map.setType(TY_NUM, TY_NUM); map.append(c); state = 10; }
        else { map.setType(TY_STR, TY_STR); i = i - 1; state = -1; }
        break;

      case 18:
        if (isDateOp(c)) { delimiterStack.push(c); state = 19; }
        else if (isNum(c) && delimiterStack.pop() === ',') { map.setType(TY_NUM, TY_NUM); state = 12; map.append(c); }
        else if (isNum(c) && delimiterStack.pop() === '-') { map.setType(TY_NUM, TY_NUM); state = 42; map.append(c); }
        else if (cn === CH_COMA && delimiterStack.pop() === ',') { map.setType(TY_NUM, TY_NUM); state = 12; }
        else if (cn === CH_FSTP && delimiterStack.pop() === ',') { map.setType(TY_NUM, TY_NUM); map.append(c); state = 10; }
        else if (cn === CH_FSTP && map.contains(DT_D) && map.contains(DT_MM)) { state = -1; }
        else { map.setType(TY_STR, TY_STR); i = i - 1; state = -1; }
        break;

      case 19:
        if (isNum(c)) { map.upgrade(c); state = 20; }
        else if (cn === CH_HYPH && i + 1 < str.length && isNum(str[i + 1])) { /* stay 19 */ }
        else { i = i - 2; state = -1; }
        break;

      case 20:
        if (isNum(c)) { map.append(c); state = 21; }
        else if (c === ':') {
          if (map.contains(DT_YY)) map.convert(DT_YY, DT_HH);
          else if (map.contains(DT_YYYY)) map.convert(DT_YYYY, DT_HH);
          state = 4;
        } else { map.remove(DT_YY); i = i - 1; state = -1; }
        break;

      case 21:
        if (isNum(c)) { map.upgrade(c); state = 22; }
        else if (c === ':') {
          if (map.contains(DT_YY)) map.convert(DT_YY, DT_HH);
          else if (map.contains(DT_YYYY)) map.convert(DT_YYYY, DT_HH);
          state = 4;
        } else { i = i - 1; state = -1; }
        break;

      case 22:
        if (isNum(c)) { map.append(c); state = -1; }
        else { map.remove(DT_YYYY); i = i - 1; state = -1; }
        break;

      case 24:
        if (isDateOp(c) || cn === CH_COMA) { delimiterStack.push(c); }
        else if (isNum(c)) {
          if (lookAheadForMerid(str, i)) { state = -1; i = i - 2; }
          else { map.upgrade(c); state = 20; }
        } else if (cn === CH_SQOT && i + 1 < str.length && isNum(str[i + 1])) { /* stay 24 */ }
        else if (c === '|') { /* stay 24 */ }
        else { i = i - 1; state = -1; }
        break;

      case 25:
        if (isNum(c)) {
          map.setType(TY_DTE, DT_YYYY); map.put(DT_MM, c); state = 26;
        } else if ((p = checkTypes(ROOT, 'FSA_MONTHS', str.substring(i))) !== null) {
          if (map.getType() === 'NUM' && (map.get(map.getType()) ?? '').length === 4) {
            map.put(DT_YYYY, map.get('NUM') ?? ''); map.remove('NUM'); map.setType(TY_DTE);
          }
          map.put(DT_MMM, p[1]); i += p[0]; state = 27;
        } else if (i > 0 && (p = checkTypes(ROOT, 'FSA_TIMES', str.substring(i))) !== null) {
          map.setType(TY_TME, undefined as any);
          let s = str.substring(0, i);
          if (p[1] === 'mins') s = '00' + s;
          extractTime(s, map.getValMap()); i += p[0]; state = -1;
        } else { i = i - 2; state = -1; }
        break;

      case 26:
        if (isNum(c)) { map.append(c); state = 27; }
        else { map.setType(TY_STR, TY_STR); i = i - 1; state = -1; }
        break;

      case 27:
        if (isDateOp(c)) { delimiterStack.push(c); state = 28; }
        else if (isNum(c)) {
          if (map.getType() === TY_DTE) map.setType(TY_NUM, TY_NUM);
          map.append(c);
          const prevDelim = delimiterStack.pop();
          const checkTimeRange = checkForTimeRange(map.get(TY_NUM) ?? '');
          if ((prevDelim === '/' || prevDelim === '-') && i + 1 < str.length && isNum(str[i + 1]) &&
              (i + 2 === str.length || (i + 2 < str.length && (isDelimiter(str[i + 2]) || str[i + 2] === '/'))) &&
              checkTimeRange) {
            map.setType(TY_TMS, TY_TMS); map.append(str[i + 1]); i++; state = -1;
          } else if (prevDelim === ' ') {
            state = 41;
          } else {
            state = 12;
          }
        } else if (cn === 42 || cn === 88 || cn === 120) {
          map.setType(TY_ACC, TY_ACC); map.append('X'); state = 11;
        } else { map.setType(TY_STR, TY_STR); i = i - 1; state = -1; }
        break;

      case 28:
        if (isNum(c) && map.getType() !== TY_TAGNUM) { map.put(DT_D, c); state = 29; }
        else { map.setType(TY_STR, TY_STR); i = i - 2; state = -1; }
        break;

      case 29:
        if (isNum(c)) map.append(c);
        else i = i - 1;
        state = -1;
        break;

      case 30:
        if (cn === CH_COMA || cn === CH_SPACE || cn === CH_NLINE) { /* stay 30 */ }
        else if (isNum(c)) { map.put(DT_D, c); state = 31; }
        else { map.setType(TY_DTE); i = i - 1; state = -1; }
        break;

      case 31:
        if (isNum(c)) { map.append(c); state = 32; }
        else if ((p = checkTypes(ROOT, 'FSA_MONTHS', str.substring(i))) !== null) {
          map.put(DT_MMM, p[1]); i += p[0]; state = 24;
        } else if (cn === CH_COMA || cn === CH_SPACE) state = 32;
        else { i = i - 1; state = -1; }
        break;

      case 32:
        if ((p = checkTypes(ROOT, 'FSA_MONTHS', str.substring(i))) !== null) {
          map.put(DT_MMM, p[1]); i += p[0]; state = 24;
        } else if (cn === CH_COMA || cn === CH_SPACE || cn === CH_NLINE) { /* stay 32 */ }
        else if ((p = checkTypes(ROOT, 'FSA_DAYSFFX', str.substring(i))) !== null) {
          i += p[0];
        } else {
          let j = i;
          while (j >= 0 && !isNum(str[j])) j--;
          i = j; state = -1;
        }
        break;

      case 33:
        if (i + 3 < str.length && isNum(c) && str.substring(i + 1, i + 3) === 'th') {
          map.put(DT_D, c); i += 2; state = 34;
        } else if (isNum(c)) { map.put(DT_D, c); state = 34; }
        else if (cn === CH_SPACE || cn === CH_COMA || cn === CH_HYPH) { /* stay 33 */ }
        else if (getPrevState(prevStates) === 1 && cn === CH_FSTP && lookAheadForNum(str, i) !== -1) {
          i = lookAheadForNum(str, i);
        } else { map.setType(TY_DTE); i = i - 1; state = -1; }
        break;

      case 34:
        if (isNum(c)) { map.append(c); state = 35; }
        else if (cn === CH_SPACE || cn === CH_COMA) state = 35;
        else { map.setType(TY_DTE); i = i - 1; state = -1; }
        break;

      case 35:
        if (isNum(c)) {
          if (i > 1 && isNum(str[i - 1])) { map.convert(DT_D, DT_YYYY); map.append(c); }
          else map.put(DT_YY, c);
          state = 20;
        } else if (cn === CH_SPACE || cn === CH_COMA) state = 40;
        else { map.setType(TY_DTE); i = i - 1; state = -1; }
        break;

      case 36:
        if (isNum(c)) { map.append(c); counter++; }
        else if (cn === CH_FSTP && i + 1 < str.length && isNum(str[i + 1])) { map.append(c); state = 10; }
        else if (cn === CH_HYPH && i + 1 < str.length && isNum(str[i + 1])) { delimiterStack.push(c); map.append(c); state = 16; }
        else if (cn === CH_SPACE && hasISDCodePrefix(str, i)) { map.setType(TY_PHN, TY_PHN); state = 46; }
        else {
          if (counter === 12 || isNumStr(str.substring(1, i))) map.setType(TY_NUM, TY_NUM);
          else return null;
          state = -1;
        }
        break;

      case 37:
        if (isNum(c)) {
          map.setType(TY_AMT, TY_AMT); map.put(TY_AMT, '-'); map.append(c); state = 12;
        } else if (cn === CH_FSTP) {
          map.put(TY_AMT, '-'); map.append(c); state = 10;
        } else state = -1;
        break;

      case 38:
        i = map.getIndex(); state = -1;
        break;

      case 39:
        if (isNum(c)) map.append(c);
        else { map.setType(TY_ACC, TY_ACC); state = -1; }
        break;

      case 40:
        if (isNum(c)) { map.put(DT_YY, c); state = 20; }
        else if (cn === CH_SPACE || cn === CH_COMA) { /* stay 40 */ }
        else { map.setType(TY_DTE); i = i - 1; state = -1; }
        break;

      case 41:
        if (isNum(c)) map.append(c);
        else if (cn === CH_SPACE) {
          if (i >= 11 && i + 1 < str.length && isNum(str[i + 1])) { state = -1; i--; }
          // else stay 41
        } else {
          if (i - 1 > 0 && str[i - 1] === ' ') i = i - 2;
          else i = i - 1;
          state = -1;
        }
        break;

      case 42:
        if (isNum(c)) map.append(c);
        else if (cn === CH_HYPH && i + 1 < str.length && isNum(str[i + 1])) state = 39;
        else { i = i - 1; state = -1; }
        break;

      case 43:
        if (isLowerAlpha(c) || isNum(c)) {
          map.setType(TY_VPD, TY_VPD);
          map.append(delimiterStack.pop()); map.append(c); state = 44;
        } else state = -1;
        break;

      case 44:
        if (isLowerAlpha(c) || isNum(c) || cn === CH_FSTP) map.append(c);
        else state = -1;
        break;

      case 45:
        if (isNum(c)) map.append(c);
        else if (cn === CH_HYPH && i + 1 < str.length && isNum(str[i + 1])) state = 39;
        else if (cn === CH_SPACE && i + 1 < str.length && isNum(str[i + 1])) { /* stay 45 */ }
        else {
          if (i - 1 > 0 && str[i - 1] === ',') i = i - 2;
          else i = i - 1;
          state = -1;
        }
        break;

      case 46:
        if (isNum(c)) map.append(c);
        else if (cn === CH_SPACE && counter < 15 && i + 1 < str.length && isNum(str[i + 1])) { /* stay 46 */ }
        else if (cn === CH_HYPH && counter < 15 && i + 1 < str.length && isNum(str[i + 1])) { /* stay 46 */ }
        else state = -1;
        break;
    }

    i++;
  }

  if (!map.getType()) return null;

  // sentence-end cleanup
  if (state === 10) { map.pop(); i--; }
  else if (state === 36) {
    if (counter === 12 || (i > 1 && isNumStr(str.substring(1, i)))) map.setType(TY_NUM, TY_NUM);
    else return null;
  }

  // AMT post-processing
  if (map.getType() === TY_AMT) {
    const amt = map.get(TY_AMT);
    if (!amt || ((amt.includes('.') && amt.split('.')[0].length > 8) ||
        (!amt.includes('.') && amt.length > 8))) {
      map.setType(TY_NUM, TY_NUM);
    }
    if (i - 3 > 0 && str[i - 3] === ',') {
      const c1 = map.pop(); const c2 = map.pop();
      map.append('.'); map.append(c2); map.append(c1);
    }
    // data suffix check (Xkb/mb/gb)
    const j = i < str.length ? i + skip(str.substring(i)) : i;
    if (j >= 0 && j < str.length) {
      const jc = str[j];
      if ((jc === 'k' || jc === 'm' || jc === 'g') && j + 1 < str.length && str[j + 1] === 'b') {
        checkIfData(str, j, map); i = j + 2;
      }
    }
  }

  setIfNumRange(str, i, map);

  // NUMRANGE fallback: no suffix matched → collapse to concatenated NUM
  if (map.getType() === TY_NUMRANGE) {
    const fromNum = map.getValMap().get('from_num') ?? '';
    const toNum = map.getValMap().get('to_num') ?? '';
    map.getValMap().delete('from_num');
    map.getValMap().delete('to_num');
    map.setType(TY_NUM, TY_NUM);
    map.setVal('num', fromNum + toNum);
  }

  // NUM post-processing
  if (map.getType() === TY_NUM) {
    const k = i < str.length ? i + skip(str.substring(i)) : i;
    if (k >= 0 && k < str.length) {
      const kc = str[k];
      if ((kc === 'k' || kc === 'm' || kc === 'g') && k + 1 < str.length && str[k + 1] === 'b') {
        checkIfData(str, k, map); i = k + 2;
      } else if (!configContextIsCURR(config) && isCurrencyAhead(str.substring(k)) &&
                 !str.substring(i, k).includes('{') && !str.substring(i, k).includes('[') && !str.substring(i, k).includes('(')) {
        map.setType(TY_AMT, TY_AMT);
        map.getValMap().set('currency', getPotentialCurrString(str.substring(k)));
        i = k + 3;
      }
    }
    // Java post-processing: NUM immediately followed by alphabetic (no space) → STR
    // e.g. "1xBrains" → STR (suppressed), not NUM=1
    const sc = config.get(YUGA_SOURCE_CONTEXT);
    if (i > 0 && i < str.length && str[i - 1] !== ' ' &&
        /[a-zA-Z]/.test(str[i]) &&
        sc !== YUGA_SC_CURR && sc !== YUGA_SC_TRANSID) {
      let j = i;
      while (j < str.length && str[j] !== ' ') j++;
      map.setType(TY_STR, TY_STR);
      i = j;
    } else if (i + 1 < str.length && str[i] === '/' && str[i + 1] === '-') {
      map.setType(TY_AMT, TY_AMT);
    } else {
      const numVal = map.get(TY_NUM);
      if (numVal) {
        if (numVal.length === 10 && '6789'.includes(numVal[0]))
          map.setVal('num_class', TY_PHN);
        else if (numVal.length === 12 && numVal.startsWith('91'))
          map.setVal('num_class', TY_PHN);
        else if (numVal.length === 11 && numVal.startsWith('18'))
          map.setVal('num_class', TY_PHN);
        else if (numVal.length === 11 && numVal[0] === '0')
          map.setVal('num_class', TY_PHN);
      }
    }
  } else if (map.getType() === TY_PHN) {
    map.setType(TY_NUM, TY_NUM);
    map.setVal('num_class', TY_PHN);
  } else if (map.getType() === TY_DTE && i + 1 < str.length) {
    // try to attach time after date
    const ind = i + skip(str.substring(i));
    const sub = str.substring(ind);
    if (ind >= 0 && ind < str.length) {
      if (isNum(str[ind]) || checkTypes(ROOT, 'FSA_MONTHS', sub) || checkTypes(ROOT, 'FSA_DAYS', sub)) {
        const p_ = parseInternal(sub, config);
        if (p_ && p_[1].getType() === TY_DTE &&
            (!map.containsAllDateContexts() || p_[1].contains(DT_HH))) {
          map.putAll(p_[1]); i = ind + p_[0];
        }
      } else {
        const pTime = checkTypes(ROOT, 'FSA_TIMEPRFX', sub);
        if (pTime) {
          const iTime = ind + pTime[0] + 1 + skip(str.substring(ind + pTime[0] + 1));
          if (iTime < str.length && (isNum(str[iTime]) || checkTypes(ROOT, 'FSA_DAYS', str.substring(iTime)) !== null)) {
            const p_ = parseInternal(str.substring(iTime), config);
            if (p_ && p_[1].getType() === TY_DTE) {
              map.putAll(p_[1]); i = iTime + p_[0];
            }
          }
        } else {
          const pTZ = checkTypes(ROOT, 'FSA_TZ', sub);
          if (pTZ) {
            const jj = skipForTZ(str.substring(ind + pTZ[0] + 1), map);
            i = ind + pTZ[0] + 1 + jj;
          } else if (sub.startsWith('pm') || sub.startsWith('am')) {
            if ((sub.length >= 3 && isDelimiter(sub[2])) || meridienTimeAhead(sub, 0))
              i = ind + 2;
          }
        }
      }
    }
  }

  return [i, map];
}

// ── prepareResult ─────────────────────────────────────────────────────────────

function prepareResult(
  str: string,
  pair: [number, FsaContextMap],
  config: Map<string, string>
): { type: string; value: string; hasTime: boolean } {
  const [index, map] = pair;
  const type = map.getType();

  if (type === TY_DTE) {
    if (map.contains(DT_MMM) && map.size() < 3)
      return { type: TY_STR, value: str.substring(0, index), hasTime: false };
    // time-only disguised as date
    if (map.contains(DT_HH) && map.contains(DT_mm) &&
        !map.contains(DT_D) && !map.contains(DT_DD) &&
        !map.contains(DT_MM) && !map.contains(DT_MMM) &&
        !map.contains(DT_YY) && !map.contains(DT_YYYY)) {
      map.setVal('time', (map.get(DT_HH) ?? '00') + ':' + (map.get(DT_mm) ?? '00'));
      return { type: TY_TME, value: str.substring(0, index), hasTime: false };
    }
    const hasExplicitYear = map.contains(DT_YY) || map.contains(DT_YYYY);
    map.setVal('hasYear', hasExplicitYear ? 'true' : 'false');
    const d = map.getDate(config);
    const hasTime = map.contains(DT_HH);
    if (d != null) {
      return { type: TY_DTE, value: str.substring(0, index), hasTime };
    }
    return { type: TY_STR, value: str.substring(0, index), hasTime: false };
  }

  const val = map.get(type);
  if (val != null) {
    if (type === TY_ACC && configContextIsCURR(config))
      return { type: TY_AMT, value: val.replace(/X/g, ''), hasTime: false };
    return { type, value: val, hasTime: false };
  }
  return { type, value: index >= 0 && index <= str.length ? str.substring(0, index) : '', hasTime: false };
}

// ── Scanner + public API ──────────────────────────────────────────────────────

const SKIP_TYPES = new Set([TY_STR, TY_TAGNUM, TY_NUMRANGE, TY_DST, TY_WGT,
  TY_RATE, TY_CALLFORWARD, TY_MLT, TY_TMERANGE, TY_DTERANGE, TY_TMS, TY_NUM_MINS, 'MLTPL']);

function yugaTokenType(yugaType: string, hasTime: boolean): string {
  if (yugaType === TY_DTE) return hasTime ? 'DATETIME' : 'DATE';
  if (yugaType === TY_TME) return 'TIME';
  if (yugaType === TY_ACC || yugaType === TY_VPD) return 'INSTRNO';
  if (yugaType === TY_DTA) return 'DATA';
  return yugaType; // AMT, NUM, PCT, USSD
}

function makeDefaultConfig(): Map<string, string> {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 00:00:00`;
  return new Map([[YUGA_CONF_DATE, dateStr]]);
}

// Matches currency prefix: Rs. / Rs / INR / ₹ / $ / € etc. followed by optional space
const CURR_PREFIX_RE = /^(?:rs\.?\s*|inr\s*|[₹$€£¥₩]\s*|usd\s*|eur\s*|gbp\s*|aed\s*)/i;

function makeCurrConfig(base: Map<string, string>): Map<string, string> {
  const m = new Map(base);
  m.set(YUGA_SOURCE_CONTEXT, YUGA_SC_CURR);
  return m;
}

export function regexTokenize(message: string): Token[] {
  const config = makeDefaultConfig();
  const currConfig = makeCurrConfig(config);
  const tokens: Token[] = [];
  const lc = message.toLowerCase();
  let i = 0;

  while (i < message.length) {
    const sub = lc.substring(i);
    const origSub = message.substring(i);

    // Check for currency prefix — call FSA with CURR context on the number part
    const currMatch = sub.match(CURR_PREFIX_RE);
    if (currMatch) {
      const prefixLen = currMatch[0].length;
      const numSub = sub.substring(prefixLen);
      if (numSub.length > 0) {
        const result = parseInternal(numSub, currConfig);
        if (result !== null) {
          const [consumed, map] = result;
          const typ = map.getType();
          if (consumed > 0 && (typ === TY_AMT || typ === TY_NUM)) {
            const pr = prepareResult(numSub, result, currConfig);
            const raw = origSub.substring(0, prefixLen + consumed);
            tokens.push({
              type: 'AMT',
              raw,
              text: pr.value.trim(),
              values: Object.fromEntries(map.getValMap()),
              locked: false,
              matched: false,
              children: [],
            });
            i += prefixLen + consumed;
            continue;
          }
        }
      }
    }

    const result = parseInternal(sub, config);

    if (result !== null) {
      const [consumed, map] = result;
      if (consumed > 0 && map.getType()) {
        const pr = prepareResult(sub, result, config);
        if (!SKIP_TYPES.has(pr.type) && pr.value.trim().length > 0) {
          const tokenType = yugaTokenType(pr.type, pr.hasTime);
          tokens.push({
            type: tokenType,
            raw: origSub.substring(0, consumed),
            text: pr.value.trim(),
            values: Object.fromEntries(map.getValMap()),
            locked: false,
            matched: false,
            children: [],
          });
        }
        i += consumed;
        continue;
      }
    }
    i++;
  }

  return tokens;
}
