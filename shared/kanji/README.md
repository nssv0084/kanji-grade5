# 漢字データ

`grade5.json` は次のデータから `scripts/build-kanji-data.ts` で作ったもの。このファイルのライセンスは元データに合わせて CC BY-SA とする。

| 内容 | 元データ | ライセンス |
|---|---|---|
| 学年、音読み、訓読み | KANJIDIC2（Electronic Dictionary Research and Development Group）https://www.edrdg.org/wiki/index.php/KANJIDIC_Project | CC BY-SA 4.0 |
| 筆順（各画の SVG パス） | KanjiVG（Ulrich Apel）https://kanjivg.tagaini.net/ 。r20260714 | CC BY-SA 3.0 |

作り直すとき:

```powershell
npx tsx scripts/build-kanji-data.ts <kanjidic2.xml> <kanjivg.xml>
```

元データは `kanjidic2.xml.gz`（edrdg.org）と、KanjiVG のリリースの `kanjivg-YYYYMMDD.xml.gz` を展開したもの。リポジトリには入れない。
