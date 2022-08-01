import { BeforeChatEvent, Player, world } from "mojang-minecraft"

const overworld = world.getDimension("overworld");
let initialized = false;
let playersAreReady = false;
let gameStarted = false;

async function IgnoreException(Inner : () => Promise<void>) {
	try {
		await Inner();
	}
	catch {}
}

world.events.tick.subscribe(async (tickEvent) => {
    const doInfrequentChecks = tickEvent.currentTick % 5 == 0;

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
				await onPlayerJoin(player);
			}
			(player as any).known = true;
		}

		// Handle game start
		if (!playersAreReady) {
			try {
				await overworld.runCommand("testfor @a[tag=Ready]");
				playersAreReady = true;
			}
			catch {
				// TestFor throws an exception if the selector doesn't include any results
			}
		}

		if (playersAreReady && !gameStarted) {
			gameStarted = true;
			await onGameStart();
		}
	}

});

async function beforeChat(event: BeforeChatEvent) {
	if (event.message.startsWith("!")) {
	  let command = event.message.substring(1);
  
	  switch (command) {
		case "clear":
		  await overworld.runCommand("say Cleaning up game...");
		  await clearWorld();
		  break;
	  }
  
	  event.cancel = true;
	}
}
world.events.beforeChat.subscribe(beforeChat);

async function onWorldLoad() {
	// Set global state
	await Promise.all([
		overworld.runCommand("structure load lobby -5 0 -5"),
		overworld.runCommand("setworldspawn 0 3 0"),
		overworld.runCommand("time set day"),
		overworld.runCommand("gamerule doDaylightCycle false"),
		overworld.runCommand("gamerule doMobLoot false"),
		overworld.runCommand("gamerule doMobSpawning false"),
		overworld.runCommand("gamerule doWeatherCycle false"),
		overworld.runCommand("gamerule randomtickspeed 6"),
		// overworld.runCommand("gamerule sendCommandFeedback false"),
	]);
}

async function onPlayerJoin(player : Player) {
	await player.runCommand("title @s subtitle PhD level games");
	await player.runCommand("title @s title Wool");

	try {
		await player.runCommand("clear @s");
	}
	catch {}
}

async function onGameStart() {
	await overworld.runCommand("give @a shears");
	
	const players = Array.from(world.getPlayers());
	const playerCount = players.length;
	if (playerCount > 1) {
		await overworld.runCommand(`say Starting game for ${playerCount} players.`);
	} else {
		await overworld.runCommand(`say Starting game for solo play.`);
	}
}

async function clearWorld() {
	await overworld.runCommand("fill -15 0 -15 15 15 15 air");
}

