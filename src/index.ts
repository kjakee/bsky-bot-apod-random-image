import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { AtpAgent, RichText} from "@atproto/api";

const MARS_API_URL = "https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/latest_photos";

// Environment Variables
const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";
const BLUESKY_HANDLE = process.env.BLUESKY_HANDLE || "";
const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD || "";

// Function to fetch the latest Mars photos and pick one randomly
async function fetchRandomLatestMarsPhoto(apiKey: string, savePath: string = "./mars_photos") {
  try {
    const response = await axios.get(MARS_API_URL, { params: { api_key: apiKey } });
    const latestPhotos = response.data.latest_photos;

    if (latestPhotos.length === 0) {
      throw new Error("No recent photos available from NASA's Mars API.");
    }

    // Select a random photo from the latest photos
    const randomPhoto = latestPhotos[Math.floor(Math.random() * latestPhotos.length)];
    const imageUrl = randomPhoto.img_src;
    const roverName = randomPhoto.rover.name;
    const cameraName = randomPhoto.camera.full_name;
    const earthDate = randomPhoto.earth_date;

    console.log(`Random photo from rover ${roverName}, camera ${cameraName}, date ${earthDate}`);
    console.log(`Image URL: ${imageUrl}`);

    // Ensure the save directory exists
    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }

    // Download and save the image
    const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
    const savedImagePath = path.join(savePath, path.basename(imageUrl));
    fs.writeFileSync(savedImagePath, imageResponse.data);
    console.log(`Image saved as: ${savedImagePath}`);

    return { roverName, cameraName, earthDate, savedImagePath };
  } catch (error) {
    console.error("An error occurred while fetching a random latest Mars photo:", error);
    throw error;
  }
}

// Function to post to BlueSky
async function postToBlueSky({
  handle,
  password,
  text,
  imagePath,
}: {
  handle: string;
  password: string;
  text: string;
  imagePath: string;
}) {
  const agent = new AtpAgent({ service: "https://bsky.social" });

  try {
    // Login to BlueSky
    await agent.login({ identifier: handle, password });
    console.log("Logged in to BlueSky");

    // Upload the image
    const imageBytes = fs.readFileSync(imagePath);
    const uploadResponse = await agent.uploadBlob(imageBytes, { encoding: "image/jpeg" });
    const imageCid = uploadResponse.data.blob.ref.toString();

    console.log("Image uploaded with CID:", imageCid);
    const rt = new RichText({text: text});
    await rt.detectFacets(agent);
  
    // Create a post with the image
    const postResponse = await agent.post({
     
                    "text": rt.text,
                    facets:rt.facets,
                    "$type": "app.bsky.feed.post",                               
                    "embed": {
                        "$type": "app.bsky.embed.images",
                        "images": [
                            {
                                "alt": "",
                                "image": {
                                    "$type": "blob",
                                    "ref": {
                                        "$link": imageCid
                                    },
                                    "mimeType": "image/jpeg",
                                    "size": 34923
                                }
                            }
                        ]
                    },
                    
               
    });

    console.log("Post created successfully:", postResponse.uri);
  } catch (error) {
    console.error("Failed to post to BlueSky:", error);
  }
}
// Main function
(async () => {
  const saveDirectory = "./mars_photos";

  try {
    // Fetch a random photo from the latest Mars photos
    const randomPhoto = await fetchRandomLatestMarsPhoto(NASA_API_KEY, saveDirectory);

    if (randomPhoto && randomPhoto.savedImagePath) {
      const { roverName, cameraName, earthDate, savedImagePath } = randomPhoto;

      // Prepare the post text
      const postText = `📸 Random Latest Mars Rover Photo 📸\n\n🚀 Rover: ${roverName}\n📅 Date: ${earthDate}\n📷 Camera: ${cameraName}\n\nExplore the Red Planet! 🪐\n\nPhoto Credit: NASA's Mars Rovers\n\n#Mars #Space #Astronomy #RedPlanet `;

      // Post the photo to BlueSky
      await postToBlueSky({
        handle: BLUESKY_HANDLE,
        password: BLUESKY_PASSWORD,
        text: postText,
        imagePath: savedImagePath,
      });

      // Remove the file
      fs.unlink(savedImagePath, (err) => {
        if (err) {
          console.error(`Error removing file: ${err}`);
          return;
        }

        console.log(`File ${savedImagePath} has been successfully removed.`);
      });

    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
  
})();
