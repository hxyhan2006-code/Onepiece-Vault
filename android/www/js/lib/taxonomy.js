// โครง Saga → Arc (ค่าเริ่มต้นจากความรู้ทั่วไปของแฟนอนิเมะ ยังไม่ได้ตรวจกับแหล่งทางการ — เลขตอนผูกกับคลิปแต่ละไฟล์ ไม่ได้ผูกกับ Arc)
const S = (id, name, arcs) => ({ id, name, arcs: arcs.map(([aid, an]) => ({ id: aid, name: an })) });

export const DEFAULT_TAXONOMY = {
  version: 1,
  sagas: [
    S('east-blue', 'East Blue', [['romance-dawn', 'Romance Dawn'], ['orange-town', 'Orange Town'], ['syrup-village', 'Syrup Village'], ['baratie', 'Baratie'], ['arlong-park', 'Arlong Park'], ['loguetown', 'Loguetown']]),
    S('alabasta', 'Alabasta', [['reverse-mountain', 'Reverse Mountain'], ['whisky-peak', 'Whisky Peak'], ['little-garden', 'Little Garden'], ['drum-island', 'Drum Island'], ['alabasta', 'Alabasta']]),
    S('sky-island', 'Sky Island', [['jaya', 'Jaya'], ['skypiea', 'Skypiea']]),
    S('water-7', 'Water 7', [['long-ring-long-land', 'Long Ring Long Land'], ['water-7', 'Water 7'], ['enies-lobby', 'Enies Lobby'], ['post-enies-lobby', 'Post-Enies Lobby']]),
    S('thriller-bark', 'Thriller Bark', [['thriller-bark', 'Thriller Bark']]),
    S('summit-war', 'Summit War', [['sabaody', 'Sabaody Archipelago'], ['amazon-lily', 'Amazon Lily'], ['impel-down', 'Impel Down'], ['marineford', 'Marineford'], ['post-war', 'Post-War']]),
    S('fish-man-island', 'Fish-Man Island', [['return-to-sabaody', 'Return to Sabaody'], ['fish-man-island', 'Fish-Man Island']]),
    S('dressrosa', 'Dressrosa', [['punk-hazard', 'Punk Hazard'], ['dressrosa', 'Dressrosa']]),
    S('whole-cake-island', 'Whole Cake Island', [['zou', 'Zou'], ['whole-cake-island', 'Whole Cake Island'], ['levely', 'Levely']]),
    S('wano', 'Wano Country', [['wano', 'Wano Country']]),
    S('final', 'Final Saga', [['egghead', 'Egghead']]),
    S('other', 'อื่น ๆ', [['filler', 'ตอนฟิลเลอร์ / ไม่ทราบ']]),
  ],
};

/** หา Arc จาก id → { saga, arc, sagaNo, arcNo } (เลขลำดับเริ่มที่ 1 นับ Arc ต่อเนื่องทั้งเรื่อง) */
export function findArc(tax, arcId) {
  let arcNo = 0;
  for (let si = 0; si < tax.sagas.length; si++) {
    for (const arc of tax.sagas[si].arcs) {
      arcNo++;
      if (arc.id === arcId) return { saga: tax.sagas[si], arc, sagaNo: si + 1, arcNo };
    }
  }
  return null;
}

export function validateTaxonomy(raw) {
  if (!raw || !Array.isArray(raw.sagas)) return DEFAULT_TAXONOMY;
  return raw;
}
