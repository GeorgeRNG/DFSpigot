function decodeTemplate(data) { // Permanently borrowed from grog 😊
  const compressData = atob(data)
  const uint = compressData.split('').map(function(e) {
    return e.charCodeAt(0)
  });
  const binData = new Uint8Array(uint)
  const string = pako.inflate(binData, { to: 'string' })
  return JSON.parse(string)
}

let mainFunc, libraries, root, eventTypes, code

export function generate() {
  let decodedJson = decodeTemplate(document.getElementById("NBTInput").value.match(/h4sI(A{5,20})[a-z0-9+_/=]+/i)[0])
  console.log(decodedJson)

  root = decodedJson.blocks[0];
  eventTypes = {
    Leave: "PlayerQuitEvent",
    Join: "PlayerJoinEvent",
    RightClick: "PlayerInteractEvent",
    LeftClick: "PlayerInteractEvent",
    Sneak: "PlayerToggleSneakEvent",
    SwapHands: "PlayerSwapHandItemsEvent"
  }

  libraries = [
    "me.wonk2.utilities.*",
    "me.wonk2.utilities.enums.*",
    "me.wonk2.utilities.values.*",
    "org.bukkit.boss.BossBar",
    "org.bukkit.command.CommandSender",
    "org.bukkit.command.Command",
    "org.bukkit.command.CommandExecutor",
    "org.bukkit.entity.LivingEntity",
    "org.bukkit.entity.Player", // If Player
    "org.bukkit.event.Listener",
    "org.bukkit.event.EventHandler",
    "org.bukkit.plugin.java.JavaPlugin",
    "java.util.*"
  ]
  libraries.push(`org.bukkit.event.player.${eventTypes[root.action]}`)

  code = [
    "public class DFPlugin extends JavaPlugin implements Listener, CommandExecutor",
    "public static HashMap<String, TreeMap<Integer, BossBar>> bossbarHandler = new HashMap<>();",
    "public static JavaPlugin plugin;",
    "",
    "@EventHandler",
    [
      "public void " + root.action + "(" + eventTypes[root.action] + " event)",
      "HashMap<String, DFValue> localVars = new HashMap<>();",
    ],
    "",
    "@Override",
    [
      "public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args)",
      "return true;",
    ],
    "",
    "@Override",
    [
      "public void onEnable()",
      "plugin = this;",
      "",
      "DFUtilities.getManagers(this);",
      "getServer().getPluginManager().registerEvents(this, this);",
      "getServer().getPluginManager().registerEvents(new DFUtilities(), this);",
    ],
  ]

  mainFunc = code[5]
  spigotify(decodedJson.blocks)
}


let mainTarget = null
function spigotify(thread) {
  let bannedBlocks = ["event", "process", "function", "entity_event"]
  let ifStatements = ["if_player", "if_var"]
  for (let i = 1; i < thread.length; i++) {
    let codeBlock = thread[i]
    if (bannedBlocks.includes(codeBlock.block)) {
      console.error("INVALID INPUT: Found 1 or more root blocks inside this thread!")
      return
    }

    if (codeBlock.id == "bracket") {
      if (codeBlock.direct == "close"){
        mainFunc = findParent(code, findParent(code, mainFunc)); // Statement is wrapped in a for loop
        mainTarget = null
      } 
      continue
    }

    let actionSyntax = `${blockClasses()[codeBlock.block]}.invokeAction(${blockParams(codeBlock)[codeBlock.block]})`
    if (!ifStatements.includes(codeBlock.block))
      mainFunc.push(`${actionSyntax};\n`)
    else {
      let temp = [`if(${actionSyntax})`]
      mainFunc.push([`for(LivingEntity target : ${selectionSyntax(codeBlock.target)})`, temp])
      temp.push("") // When formatting this will add a newline & make the if-statement more readable
      mainFunc = temp

      mainTarget = codeBlock.target
    }
    
    newImport([`me.wonk2.utilities.actions.${blockClasses()[codeBlock.block]}`])
    
    let formattedLibraries = ""
    for (let k = 0; k < libraries.length; k++) 
      formattedLibraries += `import ${libraries[k]};\n`
    
    document.getElementById("code").innerHTML =
      `package me.wonk2;\n\n${formattedLibraries}\n${formatChildren(code[0], code, "  ")}`
  }
}

function formatChildren(element, children, indent) {
  element += "{"
  for (let i = 1; i < children.length; i++) {
    if (Array.isArray(children[i])) {
      element +=
        "\n" +
        formatChildren(indent + children[i][0].replaceAll("{indent}", indent), children[i], indent + "  ")
    } else {
      element += "\n" + indent + children[i].replaceAll("{indent}", indent)
    }
  }

  return (element + "\n" + indent.replace("  ", "") + "}")
}

function getCodeArgs(codeBlock) {
  let args = []
  let slots = []
  let tags = {}
  for (let i = 0; i < codeBlock.args.items.length; i++) {
    let arg = codeBlock.args.items[i].item
    let slot = codeBlock.args.items[i].slot

    if (arg.id != "bl_tag") {
      args.push(`new DFValue(${javafyParam(arg, slot)}, ${slot}, DFType.${arg.id.toUpperCase()})`)
      slots.push(slot)
    } else tags[arg.data.tag] = arg.data.option
  }

  //Format both args & tags into hashmaps
  let argMap = ""

  let tagMap = ""
  let tagKeys = Object.keys(tags)
  let tagValues = Object.values(tags)

  for (let i = 0; i < Math.max(slots.length, tagKeys.length); i++) {
    if (i < slots.length) argMap += `\n{indent}  put(${slots[i]}, ${args[i]});`
    if (i < tagKeys.length) tagMap += `\n{indent}  put("${removeQuotes(tagKeys[i])}", "${removeQuotes(tagValues[i])}");`
  }
  argMap = slots.length == 0 ? `new HashMap<>(){}` : `new HashMap<>(){{${argMap}\n{indent}}}`
  tagMap = tagKeys.length == 0 ? `new HashMap<>(){}` : `new HashMap<>(){{${tagMap}\n{indent}}}`
  let actionName = `${codeBlock.block.replaceAll("_", "").toUpperCase()}:${codeBlock.action.replaceAll(/( $)|^ /gi, "")}`;

  return `ParamManager.formatParameters(${argMap}, \n{indent}${tagMap}, "${actionName}", localVars)`
}

function newImport(newLibraries) {
  for (let i = 0; i < newLibraries.length; i++) {
    let lib = newLibraries[i]
    if (!libraries.includes(lib)) libraries.push(lib)
  }
}

function textCodes(str) {
  let codes = {
    "%default": "event.getPlayer().getName()"
  };

  for (let i = 0; i < Object.keys(codes).length; i++) {
    let temp = Object.keys(codes)[i]
    str = str.replace(new RegExp(temp, "g"), `" + ${codes[temp]} + "`)
  }

  return str.replaceAll("Â§", "§")
}


function removeQuotes(text) {
  return text.replaceAll(`"`, `\\"`)
}

function javafyParam(arg, slot) {
  switch (arg.id) {
    case "txt":
      return `"${removeQuotes(textCodes(arg.data.name))}"`
    case "num":
      return arg.data.name + "d"
    case "snd":
      return `new DFSound("${arg.data.sound}", ${arg.data.pitch}f, ${arg.data.vol}f)`
    case "loc":
      newImport(["org.bukkit.Location", "org.bukkit.Bukkit"])

      let loc = arg.data.loc
      return `new Location(Bukkit.getServer().getWorlds().get(0), ${loc.x}, ${loc.y}, ${loc.z}, ${loc.yaw}, ${loc.pitch})`
    case "item":
      return `DFUtilities.parseItemNBT("${removeQuotes(arg.data.item)}")`
    case "pot":
      let potion = arg.data
      return `new PotionEffect(PotionEffectType.${potionEffects()[potion.pot]}, ${potion.dur}, ${potion.amp}, ${slot})`
    case "var":
      return `new DFVar("${removeQuotes(arg.data.name)}", ${varScopes()[arg.data.scope]})`
  }
}

function potionEffects() {
  return {
    "Absorption": "ABSORPTION",
    "Conduit Power": "CONDUIT_POWER",
    "Dolphin's Grace": "DOLPHINS_GRACE",
    "Fire Resistance": "FIRE_RESISTANCE",
    "Haste": "FAST_DIGGING",
    "Health Boost": "HEALTH_BOOST",
    "Hero of the Village": "HERO_OF_THE_VILLAGE",
    "Instant Health": "HEAL",
    "Invisibility": "INVISIBLITY",
    "Jump Boost": "JUMP",
    "Luck": "LUCK",
    "Night Vision": "NIGHT_VISION",
    "Regeneration": "REGENERATION",
    "Resistance": "DAMAGE_RESISTANCE",
    "Saturation": "SATURATION",
    "Slow Falling": "SLOW_FALLING",
    "Speed": "SPEED",
    "Strength": "INCREASE_DAMAGE",
    "Water Breathing": "WATER_BREATHING",
    "Bad Luck": "UNLUCK",
    "Bad Omen": "BAD_OMEN",
    "Blindness": "BLINDNESS",
    "Glowing": "GLOWING",
    "Hunger": "HUNGER",
    "Instant Damage": "HARM",
    "Levitation": "LEVITATION",
    "Mining Fatigue": "SLOW_DIGGING",
    "Nausea": "CONFUSION",
    "Poison": "POISON",
    "Slowness": "SLOWNESS",
    "Weakness": "WEAKNESS",
    "Wither": "WITHER"
  };
}

function varScopes() {
  return {
    "unsaved": "Scope.GLOBAL",
    "local": "Scope.LOCAL",
    "save": "Scope.SAVE"
  };
}

function blockClasses() {
  return {
    "player_action": "PlayerAction",
    "set_var": "SetVariable",
    "game_action": "GameAction",
    "if_player": "IfPlayer",
    "if_var": "IfVariable"
  }
}

function blockParams(codeBlock) {
  return {
    "player_action": `${getCodeArgs(codeBlock)}, "${codeBlock.action.replaceAll(/( $)|^ /gi, "")}", ${selectionSyntax(codeBlock.target)}`,
    "set_var": `${getCodeArgs(codeBlock)}, "${codeBlock.action.replaceAll(/( $)|^ /gi, "")}", ${selectionSyntax(codeBlock.target)}, localVars`,
    "game_action": `${getCodeArgs(codeBlock)}, "${codeBlock.action.replaceAll(/( $)|^ /gi, "")}", ${selectionSyntax(codeBlock.target)}`,
    "if_player": `${getCodeArgs(codeBlock)}, "${codeBlock.action.replaceAll(/( $)|^ /gi, "")}", (Player) target`,
    "if_var": `${getCodeArgs(codeBlock)}, "${codeBlock.action.replaceAll(/( $)|^ /gi, "")}", target, localVars`
  }
}

function selectionSyntax(target) {
  let targetTypes = {
    default: "new LivingEntity[]{event.getPlayer()}",
    AllPlayers: "Bukkit.getOnlinePlayers().toArray(new LivingEntity[0])"
  };

  if(target == mainTarget && mainTarget != null) return `new LivingEntity[]{target}`
  
  return target == null ?
    targetTypes["default"] :
    targetTypes[target]
}

function findParent(parentArray, arr){
  for(let i = 0; i < parentArray.length; i++){
    if(!Array.isArray(parentArray[i])) continue
    
    if(JSON.stringify(parentArray[i]) == JSON.stringify(arr)) return parentArray
    else if (Array.isArray(parentArray[i])){
      let potentialReturn = findParent(parentArray[i], arr)
      if(potentialReturn != null) return potentialReturn
    }
  }

  return null
}
  
