import { PrismaClient, DropdownCategory, Factory, Team } from "@prisma/client";

const prisma = new PrismaClient();

const options: Record<DropdownCategory, string[]> = {
  EXPORT_COUNTRY: ["필리핀", "베트남", "태국", "인도네시아"],
  TRANSPORT: ["AIR", "SEA", "특송"],
  DESTINATION_PORT: ["인천공항", "부산항", "마닐라", "호치민"],
  STORAGE_CONDITION: ["일반", "냉장", "냉동"],
  INCOTERMS: ["EXW", "FOB", "FCA", "CIF", "CIP", "DAP"],
  PAYMENT_TERM: ["T/T", "L/C", "COD"],
  DEPOSIT_STATUS: ["입금전", "일부입금", "입금완료", "L/C"],
  CURRENCY: ["USD", "EUR", "KRW"],
  FORWARDER: ["DHL", "KWE", "판토스"],
  DEPARTURE_PORT: ["인천공항", "부산항", "평택항"]
};

async function main() {
  for (const [category, labels] of Object.entries(options) as [DropdownCategory, string[]][]) {
    for (const [index, label] of labels.entries()) {
      await prisma.dropdownOption.upsert({
        where: { category_label: { category, label } },
        update: { label, sortOrder: index },
        create: { category, label, value: label, sortOrder: index }
      });
    }
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
