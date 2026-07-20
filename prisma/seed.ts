// Seed des catégories système — idempotent : rejouable autant de fois qu'on
// veut, sur une base vierge comme sur une base vivante.
// Lancement : docker compose exec server npx prisma db seed
//
// Les catégories système ont personneId = null (partagées par tous). Comme un
// index unique traite plusieurs NULL comme distincts, on ne peut pas faire un
// upsert dessus : on vérifie donc l'existence (nom + type + personneId null)
// avant de créer.
import { CATEGORIES_PAR_DEFAUT } from "../src/constants/categories.js";
import { prisma } from "../src/config/prisma.js";

for (const categorie of CATEGORIES_PAR_DEFAUT) {
  const existante = await prisma.categorie.findFirst({
    where: { nom: categorie.nom, type: categorie.type, personneId: null },
  });
  if (!existante) {
    await prisma.categorie.create({
      data: { nom: categorie.nom, type: categorie.type, icone: categorie.icone },
    });
  }
}

const nbCategories = await prisma.categorie.count({ where: { personneId: null } });
console.log(`Seed terminé : ${nbCategories} catégories système.`);

await prisma.$disconnect();
