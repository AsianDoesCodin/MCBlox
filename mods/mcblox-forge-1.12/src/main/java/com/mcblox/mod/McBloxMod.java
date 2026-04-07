package com.mcblox.mod;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiIngameMenu;
import net.minecraft.client.gui.GuiMainMenu;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.multiplayer.GuiConnecting;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraftforge.client.event.GuiScreenEvent;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.common.event.FMLInitializationEvent;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;

import java.io.File;
import java.io.FileReader;

@Mod(modid = "mcblox", name = "McBlox", version = "1.0.0", clientSideOnly = true)
public class McBloxMod {

    private static McBloxConfig config = null;
    private static boolean autoJoinDone = false;
    private static int tickDelay = 0;

    @Mod.EventHandler
    public void init(FMLInitializationEvent event) {
        config = loadConfig();
        if (config != null) {
            MinecraftForge.EVENT_BUS.register(this);
        }
    }

    private static McBloxConfig loadConfig() {
        File gameDir = Minecraft.getMinecraft().gameDir;
        File configFile = new File(gameDir, "mcblox_config.json");
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

        Minecraft mc = Minecraft.getMinecraft();
        if (mc.currentScreen instanceof GuiMainMenu) {
            tickDelay++;
            if (tickDelay < 20) return;
            autoJoinDone = true;

            if ("server".equals(config.gameType) && config.serverAddress != null) {
                ServerData serverData = new ServerData("McBlox Server", config.serverAddress, false);
                mc.displayGuiScreen(new GuiConnecting(mc.currentScreen, mc, serverData));
            } else if ("world".equals(config.gameType) && config.worldName != null) {
                mc.launchIntegratedServer(config.worldName, config.worldName, null);
            }
        }
    }

    @SubscribeEvent
    public void onGuiInit(GuiScreenEvent.InitGuiEvent.Post event) {
        if (config == null) return;

        GuiScreen screen = event.getGui();
        if (screen instanceof GuiIngameMenu) {
            GuiButton toRemove = null;
            for (Object widget : event.getButtonList()) {
                if (widget instanceof GuiButton) {
                    GuiButton btn = (GuiButton) widget;
                    if (btn.displayString.contains("Disconnect") || btn.displayString.contains("Save and Quit")) {
                        toRemove = btn;
                        break;
                    }
                }
            }
            if (toRemove != null) {
                final int x = toRemove.x;
                final int y = toRemove.y;
                final int w = toRemove.width;
                final int h = toRemove.height;
                event.getButtonList().remove(toRemove);
                GuiButton exitBtn = new GuiButton(9999, x, y, w, h, "Exit Game");
                event.getButtonList().add(exitBtn);
            }
        }
    }

    @SubscribeEvent
    public void onGuiAction(GuiScreenEvent.ActionPerformedEvent.Pre event) {
        if (config == null) return;
        if (event.getGui() instanceof GuiIngameMenu) {
            if (event.getButton().id == 9999) {
                Minecraft.getMinecraft().shutdown();
                event.setCanceled(true);
            }
        }
    }

    public static class McBloxConfig {
        public String gameType;
        public String serverAddress;
        public String worldName;
    }
}
