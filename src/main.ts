import { 
	BeforeChatEvent, 
	BlockInventoryComponentContainer, 
	BlockLocation,
	CommandResult, 
	MinecraftItemTypes,
	Player, 
	world 
} from "mojang-minecraft"

const roundTime = 180;
const overworld = world.getDimension("overworld");

let initialized = false;
let playersAreReady = false;
let inGame = false;
let roundRemaingingTime = -1;
let winningPlayerName = "";
let winningScore = 0;

async function IgnoreException(Inner : () => Promise<CommandResult>) {
	try {
		return await Inner();
	}
	catch {}
}

world.events.tick.subscribe(async (tickEvent) => {
	const currentTick = tickEvent.currentTick;
    const doInfrequentChecks =currentTick % 5 == 0;

	// Handle game initialization
	if (!initialized) {
		initialized = true;
		await onWorldLoad();
	}

	// Infrequent checks to avoid a flood of checks happening every tick
	if (doInfrequentChecks) {

		// Handle new player joins
		for (let player of world.getPlayers()) {
			if (!(player as any).known) {
				await onPlayerJoin(player);   // Player join clears tags, so must await
				(player as any).known = true;
			}
		}

		// Handle game start
		if (!playersAreReady) {
			const result = await overworld.runCommandAsync("testfor @a[tag=Ready]");
			if (result.successCount > 0) {
				playersAreReady = true;
			}
		}

		if (playersAreReady && !inGame) {
			inGame = true;
			await onGameStart();
		}

		await updateTimeRemaining(currentTick);

		await updateScore();
	}
});

async function updateTimeRemaining(tick: number) {
	if (roundRemaingingTime >= 0) {
		// Show the time to all players
		let minutes = Math.floor(roundRemaingingTime / 60);
		let seconds: string = (roundRemaingingTime % 60).toString();
		
		while (seconds.length < 2) seconds = "0" + seconds;
		overworld.runCommandAsync(`title @a actionbar ${minutes}:${seconds}`);  // Fire and forget

		// Decrement remaining time
		if (tick % 20 == 0) {
			roundRemaingingTime--;

			// End the game if time has elapsed
			if (roundRemaingingTime < 0) {
				await onGameEnd();
			}
		}
	}
}

async function updateScore() {
	if (roundRemaingingTime >= 0) {
		const players = Array.from(world.getPlayers());

		//   Create arena copy for each player
		for (let i = 0; i < players.length; i++) {
			let playerScore = 0;
			let chestBlock = overworld.getBlock(new BlockLocation(13 + 100 * i, 6, 131));

			let chest: BlockInventoryComponentContainer = chestBlock.getComponent("inventory").container;
			for (let j = 0; j < chest.size; j++) {
				let itemStack = chest.getItem(j);
				if (itemStack && itemStack.id == MinecraftItemTypes.wool.id) {
					switch (itemStack.data) {
						case 2: // Purple
							playerScore += 5 * itemStack.amount;
							break;
						case 11: // Blue
							playerScore += 3 * itemStack.amount;
							break;
						case 14: // Red
							playerScore += 2 * itemStack.amount;
							break;
						case 15: // Black
							playerScore += 10 * itemStack.amount;
							break;
						default:
							// White & all others
							playerScore += 1 * itemStack.amount;
							break;
					}
				}
			}

			if (playerScore > winningScore) {
				winningScore = playerScore;
				winningPlayerName = players[i].name;
			}

			await players[i].runCommandAsync(`scoreboard players set @s score ${playerScore}`);
		}
	}
}

async function beforeChat(event: BeforeChatEvent) {
	if (event.message.startsWith("!")) {
	  let command = event.message.substring(1);
  
	  switch (command) {
		case "clear":
		  await overworld.runCommandAsync("say Cleaning up game...");
		  clearWorld();
		  break;
	  }
  
	  event.cancel = true;
	}
}
world.events.beforeChat.subscribe(beforeChat);

async function onWorldLoad() {
	// Set global state
	await Promise.all([
		overworld.runCommandAsync("structure load lobby -5 0 -5"),
		overworld.runCommandAsync("setworldspawn 0 3 0"),
		overworld.runCommandAsync("time set day"),
		overworld.runCommandAsync("gamerule doDaylightCycle false"),
		overworld.runCommandAsync("gamerule doMobLoot false"),
		overworld.runCommandAsync("gamerule doMobSpawning false"),
		overworld.runCommandAsync("gamerule doWeatherCycle false"),
		overworld.runCommandAsync("gamerule randomtickspeed 6"),
		overworld.runCommandAsync("gamerule sendCommandFeedback false"),
		IgnoreException(() => overworld.runCommandAsync("scoreboard objectives remove score")),
	]);
}

async function onPlayerJoin(player : Player) {
	await player.runCommandAsync("gamemode adventure @s");
	await player.runCommandAsync("title @s subtitle PhD level games");
	await player.runCommandAsync("title @s title Wool");
	await IgnoreException(() => player.runCommandAsync("clear @s"));
	await IgnoreException(() => player.runCommandAsync("tag @s remove Ready"));
	await player.runCommandAsync("tp @s 0 3 0 facing 0 3 1");
}

async function onGameStart() {
	await overworld.runCommandAsync("give @a shears");
	
	const players = Array.from(world.getPlayers());
	const playerCount = players.length;
	if (playerCount > 1) {
		await overworld.runCommandAsync(`say Starting game for ${playerCount} players.`);
	} else {
		await overworld.runCommandAsync(`say Starting game for solo play.`);
	}

	await IgnoreException(() => overworld.runCommandAsync('scoreboard objectives add score dummy "Score"'));	
	await overworld.runCommandAsync("scoreboard players set @a score 0");
	await overworld.runCommandAsync("scoreboard objectives setdisplay sidebar score descending");

	//   Create arena copy for each player
	for (let i = 0; i < playerCount; i++) {
		let x = 100 * i;
		let y = 0;
		let z = 100;
		await players[i].runCommandAsync(`structure load arena ${x} ${y} ${z}`);

		x += 8;
		y += 1;
		z += 1;
		await players[i].runCommandAsync(`tp @s ${x} ${y} ${z} facing ${x} ${y} ${z + 1}`);
	}

	await overworld.runCommandAsync("title @a clear");
	await overworld.runCommandAsync("title @a title GO!");

	roundRemaingingTime = roundTime;
}

async function onGameEnd() {
	playersAreReady = false;
	inGame = false;

    await IgnoreException(() => overworld.runCommandAsync("scoreboard objectives remove score"));
	await IgnoreException(() => overworld.runCommandAsync("clear @a"));
	await IgnoreException(() => overworld.runCommandAsync("tag @a remove Ready"));
	await overworld.runCommandAsync("tp @a 0 3 0");
	await overworld.runCommandAsync("title @a clear");

	if (winningScore > 0) {
		await overworld.runCommandAsync(`title @a subtitle ${winningPlayerName} wins!`);
		await overworld.runCommandAsync("title @a title Game Over");
	} else {
		await overworld.runCommandAsync("title @a subtitle Nobody scored. What gives?");
		await overworld.runCommandAsync("title @a title Game Over");
	}
}

async function clearWorld() {
	await overworld.runCommandAsync("fill -15 0 -15 15 15 15 air");
}

