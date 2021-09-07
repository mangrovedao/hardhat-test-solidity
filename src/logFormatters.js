module.exports = (hre, formatArg) => {
  const ethers = hre.ethers;
  const basis = ["String", "Uint"];
  const next = (n) => basis.flatMap((x) => n.map((xs) => [x, ...xs]));
  const p1 = next([[]]);
  const p2 = next(p1);
  const p3 = next(p2);

  let ret = {};
  for (const types of [...p1, ...p2, ...p3]) {
    ret[`Log${types.join("")}`] = (log, rawLog, originator) => {
      console.log("");
      console.log("➤ " + types.map((t, i) => formatArg(log.args[i])).join(" "));
      console.log("");
    };
  }
  return ret;
};