package com.mcblox.mod;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screen.*;
import net.minecraft.client.gui.widget.button.Button;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.util.text.StringTextComponent;
import net.minecraftforge.client.event.GuiOpenEvent;
import net.minecraftforge.client.event.GuiScreenEvent;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.loading.FMLPaths;

import java.io.File;
import java.io.FileReader;

@Mod("mcblox")
public class McBloxMod {

    private static McBloxConfig config = null;
    private static boolean skipAttempted = false;

    public McBloxMod() {
        config = loadConfig();
        if (config != null) {
            MinecraftForge.EVENT_BUS.register(this);
        }
    }

    private static McBloxConfig loadConfig() {
        File configFile = new File(FMLPaths.GAMEDIR.get().toFile(), "mcblox_config.json");
        if (!configFile.exists()) return null;
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

    // 1.16.5 uses GuiOpenEvent to intercept screen opens
    @SubscribeEvent
    public void onGuiOpen(GuiOpenEvent event) {
        if (skipAttempted || config == null) return;
        if (!(event.getGui() instanceof MainMenuScreen)) return;

        skipAttempted = true;
        Minecraft mc = Minecraft.getInstance();

        if ("server".equals(config.gameType) && config.serverAddress != null) {
            event.setCanceled(true);
            ServerData serverData = new ServerData("McBlox Server", config.serverAddress, false);
            mc.tell(() -> {
                try {
                    mc.setScreen(new ConnectingScreen(new MainMenuScreen(), mc, serverData));
                } catch (Exception e) {
                    e.printStackTrace();
                    skipAttempted = false;
                    mc.setScreen(new MainMenuScreen());
                }
            });
        } else if ("world".equals(config.gameType) && config.worldName != null) {
            event.setCanceled(true);
            mc.tell(() -> {
                try {
                    mc.loadLevel(config.worldName);
                } catch (Exception e) {
                    e.printStackTrace();
                    skipAttempted = false;
                    mc.setScreen(new MainMenuScreen());
                }
            });
        }
    }

    @SubscribeEvent
    public void onScreenInit(GuiScreenEvent.InitGuiEvent.Post event) {
        if (config == null) return;
        if (!(event.getGui() instanceof IngameMenuScreen)) return;

        for (var widget : event.getWidgetList()) {
            if (widget instanceof Button) {
                Button btn = (Button) widget;
                String msg = btn.getMessage().getString();
                if (msg.contains("Disconnect") || msg.contains("Save and Quit")
                        || msg.contains("disconnect") || msg.contains("quit")) {
                    event.removeWidget(btn);
                    event.addWidget(new Button(btn.x, btn.y, btn.getWidth(), btn.getHeight(),
                        new StringTextComponent("Save and Quit"), b -> Minecraft.getInstance().stop()));
                    break;
                }
            }
        }
    }

    public static class McBloxConfig {
        public String gameType;
        public String serverAddress;
        public String worldName;
    }
}
