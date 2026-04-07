package com.mcblox.mod;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.*;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.loading.FMLPaths;

import java.io.File;
import java.io.FileReader;

@Mod("mcblox")
public class McBloxMod {

    private static McBloxConfig config = null;
    private static boolean autoJoinDone = false;
    private static int tickDelay = 0;

    public McBloxMod() {
        config = loadConfig();
        if (config != null) {
            MinecraftForge.EVENT_BUS.register(this);
        }
    }

    private static McBloxConfig loadConfig() {
        // Look for mcblox_config.json in game directory
        File configFile = new File(FMLPaths.GAMEDIR.get().toFile(), "mcblox_config.json");
        if (!configFile.exists()) {
            return null;
        }
        try (FileReader reader = new FileReader(configFile)) {
            JsonObject json = new Gson().fromJson(reader, JsonObject.class);
            McBloxConfig cfg = new McBloxConfig();
            cfg.gameType = json.has("game_type") ? json.get("game_type").getAsString() : "server";
            cfg.serverAddress = json.has("server_address") ? json.get("server_address").getAsString() : null;
            cfg.worldName = json.has("world_name") ? json.get("world_name").getAsString() : null;
            return cfg;
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    @SubscribeEvent
    public void onClientTick(TickEvent.ClientTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        if (autoJoinDone || config == null) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.screen instanceof TitleScreen || mc.screen instanceof GenericDirtMessageScreen) {
            // Wait a few ticks for the title screen to stabilize
            tickDelay++;
            if (tickDelay < 20) return;

            autoJoinDone = true;

            if ("server".equals(config.gameType) && config.serverAddress != null) {
                // Connect to server
                ServerAddress addr = ServerAddress.parseString(config.serverAddress);
                ServerData serverData = new ServerData("McBlox Server", config.serverAddress, false);
                ConnectScreen.startConnecting(mc.screen, mc, addr, serverData, false);
            } else if ("world".equals(config.gameType) && config.worldName != null) {
                // Load singleplayer world by folder name
                mc.forceSetScreen(new GenericDirtMessageScreen(Component.literal("Loading world...")));
                mc.createWorldOpenFlows().loadLevel(mc.screen, config.worldName);
            }
        }
    }

    @SubscribeEvent
    public void onScreenInit(ScreenEvent.Init.Post event) {
        if (config == null) return;

        Screen screen = event.getScreen();

        // Replace Disconnect button with Exit button on pause screen
        if (screen instanceof PauseScreen) {
            // Find the disconnect/save-and-quit button
            Button toRemove = null;
            for (var widget : event.getListenersList()) {
                if (widget instanceof Button btn) {
                    String msg = btn.getMessage().getString();
                    if (msg.contains("Disconnect") || msg.contains("Save and Quit")) {
                        toRemove = btn;
                        break;
                    }
                }
            }
            if (toRemove != null) {
                Button exitBtn = Button.builder(Component.literal("Exit Game"), b -> {
                    Minecraft.getInstance().stop();
                }).bounds(toRemove.getX(), toRemove.getY(), toRemove.getWidth(), toRemove.getHeight()).build();
                event.removeListener(toRemove);
                event.addListener(exitBtn);
            }
        }
    }

    public static class McBloxConfig {
        public String gameType;
        public String serverAddress;
        public String worldName;
    }
}
