import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const {
  MONDAY_TOKEN,
  TIMESHEET_BOARD,
  SITES_BOARD,
  PORT = 3000
} = process.env;

const API = "https://api.monday.com/v2";
const API_VERSION = "2023-10";
const TT_COL = "tt";
const LINK_COL = "linked_site";
const END_COL = "end";

const app = express();
app.use(express.json());

function run(query, variables={}) {
  return fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_TOKEN,
      "API-Version": API_VERSION
    },
    body: JSON.stringify({ query, variables })
  }).then(r => r.json());
}

/* --- weekly rollover --- */
app.post("/weekly-rollover", async (_req, res) => {
  const today = new Date();
  const days = (1 - today.getUTCDay() + 7) % 7;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + days);
  const groupName = monday.toISOString().slice(0,10);

  const groups = await run(
    `query ($b:Int!){ boards(ids:[$b]){ groups{ title }}}`,
    { b: Number(TIMESHEET_BOARD) }
  );
  if (groups.data.boards[0].groups.some(g => g.title === groupName)) {
    return res.sendStatus(204);
  }

  const newGroup = await run(
    `mutation ($b:Int!,$n:String!){ create_group(board_id:$b, group_name:$n){ id }}`,
    { b: Number(TIMESHEET_BOARD), n: groupName }
  );
  const groupId = newGroup.data.create_group.id;

  const daysOfWeek = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
  for (const d of daysOfWeek) {
    await run(
      `mutation ($b:Int!,$g:String!,$n:String!){
         create_item(board_id:$b, group_id:$g, item_name:$n){ id }}`,
      { b: Number(TIMESHEET_BOARD), g: groupId, n: d }
    );
  }
  res.send("Week created");
});

/* --- start segment --- */
app.post("/api/start", async (req,res)=>{
  const { siteId, dayItemId } = req.body;
  const sub = await run(
    `mutation ($parent:Int!,$name:String!,$val:JSON!){
       create_subitem(parent_item_id:$parent,item_name:$name,column_values:$val){ id }}`,
    {
      parent: Number(dayItemId),
      name: "Segment",
      val: JSON.stringify({ [LINK_COL]: { item_ids: [Number(siteId)] } })
    }
  );
  const subId = sub.data.create_subitem.id;
  await run(
    `mutation ($id:Int!,$col:String!,$v:JSON!){
       change_column_value(item_id:$id,column_id:$col,value:$v){ id }}`,
    { id: Number(subId), col: TT_COL, v: JSON.stringify({ running:"true" }) }
  );
  res.json({ itemId: subId });
});

/* --- stop segment --- */
app.post("/api/stop", async (req,res)=>{
  const { itemId } = req.body;
  await run(
    `mutation ($id:Int!,$col:String!,$v:JSON!){
       change_column_value(item_id:$id,column_id:$col,value:$v){ id }}`,
    { id: Number(itemId), col: TT_COL, v: JSON.stringify({ running:"false" }) }
  );
  res.sendStatus(204);
});

/* --- close day --- */
app.post("/api/close-day", async (req,res)=>{
  const { itemId } = req.body;
  await run(
    `mutation ($id:Int!,$col:String!,$v:Date!){
       change_column_value(item_id:$id,column_id:$col,value:$v){ id }}`,
    { id: Number(itemId), col: END_COL, v: new Date().toISOString() }
  );
  res.sendStatus(204);
});

app.listen(PORT, () => console.log(`GeoTimesheet backend on :${PORT}`));