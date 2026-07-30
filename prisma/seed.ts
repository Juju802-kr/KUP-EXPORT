import { PrismaClient, DropdownCategory, Factory, Team } from "@prisma/client";
import { inferDestinationFields } from "../src/lib/destination-registry";

const prisma = new PrismaClient();

const options: Record<DropdownCategory, string[]> = {
  EXPORT_COUNTRY: ["필리핀", "베트남", "태국", "인도네시아"],
  TRANSPORT: ["AIR", "SEA", "특송"],
  DESTINATION_PORT: [
    "인천공항",
    "부산항",
    "평택항",
    "NAIA",
    "마닐라",
    "세부",
    "세부공항",
    "호치민",
    "호치민공항",
    "하노이공항",
    "하이퐁항",
    "방콕공항",
    "방콕항",
    "자카르타공항",
    "자카르타항",
    "울란바토르공항",
    "울란바토르항",
    "양곤공항",
    "양곤항",
    "다카공항",
    "Chittagong Port"
  ],
  STORAGE_CONDITION: ["일반", "냉장", "냉동"],
  INCOTERMS: ["EXW", "FOB", "FCA", "CIF", "CIP", "DAP"],
  PAYMENT_TERM: ["T/T", "L/C", "COD"],
  DEPOSIT_STATUS: ["입금전", "일부입금", "입금완료", "L/C"],
  BANK: ["\uAD6D\uBBFC\uC740\uD589", "\uC2E0\uD55C\uC740\uD589", "\uD558\uB098\uC740\uD589", "\uC6B0\uB9AC\uC740\uD589"],
  CURRENCY: ["USD", "EUR", "KRW"],
  FORWARDER: ["DHL", "KWE", "판토스"],
  DEPARTURE_PORT: ["인천공항", "부산항", "평택항"]
};

async function main() {
  for (const [category, labels] of Object.entries(options) as [DropdownCategory, string[]][]) {
    for (const [index, label] of labels.entries()) {
      const destinationMeta =
        category === DropdownCategory.DESTINATION_PORT ? inferDestinationFields(label) : null;
      await prisma.dropdownOption.upsert({
        where: { category_label: { category, label } },
        update: {
          label,
          sortOrder: index,
          ...(destinationMeta
            ? {
                destinationCountry: destinationMeta.country || null,
                destinationKind: destinationMeta.kind
              }
            : {})
        },
        create: {
          category,
          label,
          value: label,
          sortOrder: index,
          ...(destinationMeta
            ? {
                destinationCountry: destinationMeta.country || null,
                destinationKind: destinationMeta.kind
              }
            : {})
        }
      });
    }
  }

  const overseasSalesTeam: Array<{ label: string; partNo: number; rankNo: number }> = [
    { label: "조한선", partNo: -1, rankNo: 1 },
    { label: "김상훈", partNo: 1, rankNo: 1 },
    { label: "도준현", partNo: 1, rankNo: 2 },
    { label: "변재형", partNo: 1, rankNo: 3 },
    { label: "최유라", partNo: 2, rankNo: 1 },
    { label: "박사라", partNo: 2, rankNo: 2 },
    { label: "음정현", partNo: 2, rankNo: 3 },
    { label: "심상완", partNo: 3, rankNo: 1 },
    { label: "권정현", partNo: 3, rankNo: 2 }
  ];
  for (const member of overseasSalesTeam) {
    const sortOrder = member.partNo * 1000 + member.rankNo;
    await prisma.dropdownOption.upsert({
      where: { category_label: { category: DropdownCategory.OVERSEAS_SALES_TEAM, label: member.label } },
      update: {
        partNo: member.partNo,
        rankNo: member.rankNo,
        sortOrder,
        value: member.label
      },
      create: {
        category: DropdownCategory.OVERSEAS_SALES_TEAM,
        label: member.label,
        value: member.label,
        partNo: member.partNo,
        rankNo: member.rankNo,
        sortOrder
      }
    });
  }

  if ((await prisma.productMaster.count()) === 0) {
    await prisma.productMaster.createMany({
      data: [
        { name: "본덱스주", costGroupCode: "7CT", factory: Factory.SEOMYEON },
        { name: "하이드린캡슐", costGroupCode: "15CT", factory: Factory.JEONDONG }
      ]
    });
  }

  if ((await prisma.buyerMaster.count()) === 0) {
    await prisma.buyerMaster.createMany({
      data: [
        {
          exportCountry: "필리핀",
          buyerName: "Prosel",
          defaultCurrency: "USD",
          exportOwner: "수출지원",
          salesEmailRecipients: "sales@kup.co.kr",
          exportEmailRecipients: "export@kup.co.kr",
          branchEmailRecipients: "branch@kup.co.kr",
          contactPerson: "정수빈"
        },
        {
          exportCountry: "베트남",
          buyerName: "VN Pharma",
          defaultCurrency: "USD",
          exportOwner: "수출지원",
          salesEmailRecipients: "sales@kup.co.kr",
          exportEmailRecipients: "export@kup.co.kr",
          branchEmailRecipients: "",
          contactPerson: "김민수"
        }
      ]
    });
  }

  for (const team of Object.values(Team)) {
    const email = `${team.toLowerCase()}@kup.co.kr`;
    await prisma.teamEmail.upsert({
      where: { team_email: { team, email } },
      update: {},
      create: { team, email }
    });
  }
}

main().finally(async () => prisma.$disconnect());
