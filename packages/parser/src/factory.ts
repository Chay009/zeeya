// Exact 1:1 port of BankParserFactory.kt from Cashiro parser-core
// Parser order must exactly match BankParserFactory.kt — first-match wins
import type { BankParser } from './base-parser.js';
import type { ParseResult, SmsInput } from './types.js';

import { HDFCMutualFundParser } from './banks/hdfc-mutual-fund.js';
import { HDFCBankParser } from './banks/hdfc.js';
import { SBIBankParser } from './banks/sbi.js';
import { SaraswatBankParser } from './banks/saraswat.js';
import { DBSBankParser } from './banks/dbs.js';
import { IndianBankParser } from './banks/indian-bank.js';
import { FederalBankParser } from './banks/federal.js';
import { JuspayParser } from './banks/juspay.js';
import { SliceParser } from './banks/slice.js';
import { CredParser } from './banks/cred.js';
import { LazyPayParser } from './banks/lazypay.js';
import { UtkarshBankParser } from './banks/utkarsh.js';
import { ICICIBankParser } from './banks/icici.js';
import { KarnatakaBankParser } from './banks/karnataka.js';
import { KeralaGraminBankParser } from './banks/kerala-gramin.js';
import { IDBIBankParser } from './banks/idbi.js';
import { JupiterBankParser } from './banks/jupiter.js';
import { AxisBankParser } from './banks/axis.js';
import { PNBBankParser } from './banks/pnb.js';
import { CanaraBankParser } from './banks/canara.js';
import { BankOfBarodaParser } from './banks/bob.js';
import { BankOfIndiaParser } from './banks/bank-of-india.js';
import { JioPaymentsBankParser } from './banks/jio-payments.js';
import { KotakBankParser } from './banks/kotak.js';
import { IDFCFirstBankParser } from './banks/idfc.js';
import { UnionBankParser } from './banks/union.js';
import { HSBCBankParser } from './banks/hsbc.js';
import { CentralBankOfIndiaParser } from './banks/central-bank.js';
import { SouthIndianBankParser } from './banks/south-indian.js';
import { JKBankParser } from './banks/jk-bank.js';
import { JioPayParser } from './banks/jio-pay.js';
import { IPPBParser } from './banks/ippb.js';
import { DOPBankParser } from './banks/dop.js';
import { CityUnionBankParser } from './banks/city-union.js';
import { IndianOverseasBankParser } from './banks/indian-overseas.js';
import { AirtelPaymentsBankParser } from './banks/airtel-payments.js';
import { IndusIndBankParser } from './banks/indusind.js';
import { AMEXBankParser } from './banks/amex.js';
import { OneCardParser } from './banks/one-card.js';
import { UCOBankParser } from './banks/uco.js';
import { AUBankParser } from './banks/au-bank.js';
import { YesBankParser } from './banks/yes.js';
import { BandhanBankParser } from './banks/bandhan.js';
import { NSDLPaymentsBankParser } from './banks/nsdl-payments.js';
import { PunjabSindBankParser } from './banks/punjab-sind.js';
import { KeralaBankParser } from './banks/kerala-bank.js';
import { CashfreeParser } from './banks/cashfree.js';
import { NaviMutualFundParser } from './banks/navi-mutual-fund.js';
import { DhanlaxmiBankParser } from './banks/dhanlaxmi.js';
import { EquitasBankParser } from './banks/equitas.js';
// --- International banks below (P2 / P3) ---
// TODO: ADCBParser, FABParser, EmiratesNBDParser, LivBankParser
// TODO: CitiBankParser, DiscoverCardParser, OldHickoryParser
// TODO: LaxmiBankParser, CBEBankParser, EverestBankParser
// TODO: BancolombiaParser, MashreqBankParser, CharlesSchwabParser
// TODO: NavyFederalParser, AdelFiParser, AlecuBankParser
// TODO: PriorbankParser, AlinmaBankParser, NabilBankParser
// TODO: NMBBankParser, ManjushreeFinanceParser, SiddharthaBankParser
// TODO: PrimeCommercialBankParser, MPesaTanzaniaParser, MPESAParser
// TODO: SelcomPesaParser, TigoPesaParser, CIBEgyptParser
// TODO: HuntingtonBankParser, StandardCharteredBankParser
// TODO: TelebirrParser, ZemenBankParser
// TODO: DashenBankParser, FaysalBankParser, MelliBankParser
// TODO: ParsianBankParser, BangkokBankParser, KasikornBankParser
// TODO: SiamCommercialBankParser, KrungThaiBankParser, KrungsriBankParser
// TODO: TTBBankParser, GSBBankParser, BAACBankParser, UOBThailandParser
// TODO: CIMBThaiParser, KTCCreditCardParser, MBankCZParser
// TODO: AlRajhiBankParser, ChaseBankParser, TBankParser
// TODO: BankMuscatParser, BPCEParser, StandardBankMozambiqueParser
// TODO: MillenniumBimParser, EMolaParser, MPesaMozambiqueParser
// TODO: CrdbBankParser, DiamondTrustBankParser, MixxByYasParser
// TODO: NMBTanzaniaParser, GreaterBankParser
// TODO: AccessBankParser, ZenithBankParser, KeystoneBankParser
// TODO: JaizBankParser, OpayBankParser
// TODO: EmiratesIslamicParser, SNBAlAhliBankParser, STCBankParser
// TODO: SabbBankParser, MellatBankParser, BankinoBankParser
// TODO: BluBankParser, ArabBankParser
// TODO: SampathBankParser, EnparaBankParser, SparkasseRheinMaasParser
// TODO: AltanaFCUParser
import { GenericUPIParser } from './banks/upi-generic.js';

const PARSERS: BankParser[] = [
  new HDFCMutualFundParser(),  // must precede HDFCBankParser
  new HDFCBankParser(),
  new SBIBankParser(),
  new SaraswatBankParser(),
  new DBSBankParser(),
  new IndianBankParser(),
  new FederalBankParser(),
  new JuspayParser(),
  new SliceParser(),
  new CredParser(),
  new LazyPayParser(),
  new UtkarshBankParser(),
  new ICICIBankParser(),
  new KarnatakaBankParser(),
  new KeralaGraminBankParser(),
  new IDBIBankParser(),
  new JupiterBankParser(),
  new AxisBankParser(),
  new PNBBankParser(),
  new CanaraBankParser(),
  new BankOfBarodaParser(),
  new BankOfIndiaParser(),
  new JioPaymentsBankParser(),
  new KotakBankParser(),
  new IDFCFirstBankParser(),
  new UnionBankParser(),
  new HSBCBankParser(),
  new CentralBankOfIndiaParser(),
  new SouthIndianBankParser(),
  new JKBankParser(),
  new JioPayParser(),
  new IPPBParser(),
  new DOPBankParser(),
  new CityUnionBankParser(),
  new IndianOverseasBankParser(),
  new AirtelPaymentsBankParser(),
  new IndusIndBankParser(),
  new AMEXBankParser(),
  new OneCardParser(),
  new UCOBankParser(),
  new AUBankParser(),
  new YesBankParser(),
  new BandhanBankParser(),
  new NSDLPaymentsBankParser(),
  new PunjabSindBankParser(),
  new KeralaBankParser(),
  new CashfreeParser(),
  new NaviMutualFundParser(),
  new DhanlaxmiBankParser(),
  new EquitasBankParser(),
  new GenericUPIParser(),
];

function getParser(sender: string): BankParser | null {
  for (const p of PARSERS) {
    if (p.canHandle(sender)) return p;
  }
  return null;
}

export function parseSms(input: SmsInput): ParseResult {
  const parser = getParser(input.sender);
  if (!parser) return null;
  return parser.parse(input.body, input.sender, input.timestamp);
}

export function isKnownSender(sender: string): boolean {
  return getParser(sender) !== null;
}

export function getParserByName(bankName: string): BankParser | null {
  return PARSERS.find(p => p.getBankName() === bankName) ?? null;
}

export function getAllParsers(): BankParser[] {
  return PARSERS;
}
