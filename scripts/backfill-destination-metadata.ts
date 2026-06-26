import { DropdownCategory, PrismaClient } from "@prisma/client";
import { rebuildDestinationPortMetadata } from "../src/lib/destination-registry";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.dropdownOption.findMany({
    where: { category: DropdownCategory.DESTINATION_PORT },
    select: { id: true, label: true }
  });
  const patches = rebuildDestinationPortMetadata(rows);
  if (!patches.length) {
    console.log("No destination ports found.");
    return;
  }
  await prisma.$transaction(
    patches.map((patch) =>
      prisma.dropdownOption.update({
        where: { id: patch.id },
        data: {
          destinationCountry: patch.destinationCountry,
          destinationKind: patch.destinationKind
        }
      })
    )
  );
  console.log(`Updated ${patches.length} destination port(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
