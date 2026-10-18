# 漢字データ

`grade5.json`（5年生の193字の読みと筆順）と `readings.json`（1〜5年生の835字の学年と読み。問題文の検査に使う）は、次のデータから `scripts/build-kanji-data.ts` で作ったもの。これらのファイルのライセンスは元データに合わせて CC BY-SA とする。

| 内容 | 元データ | ライセンス |
|---|---|---|
| 音読み・訓読み（常用漢字表） | ウィキペディア日本語版「常用漢字一覧」https://ja.wikipedia.org/wiki/常用漢字一覧 | CC BY-SA 4.0 |
| 学年 | KANJIDIC2（Electronic Dictionary Research and Development Group）https://www.edrdg.org/wiki/index.php/KANJIDIC_Project | CC BY-SA 4.0 |
| 筆順（各画の SVG パス） | KanjiVG（Ulrich Apel）https://kanjivg.tagaini.net/ 。r20260714 | CC BY-SA 3.0 |

作り直すとき:

```powershell
npx tsx scripts/build-kanji-data.ts <kanjidic2.xml> <kanjivg.xml> <常用漢字一覧.wiki>
```

元データは `kanjidic2.xml.gz`（edrdg.org）と、KanjiVG のリリースの `kanjivg-YYYYMMDD.xml.gz` を展開したもの。リポジトリには入れない。
