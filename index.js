// Importing the module for reading files
const fs = require('node:fs').promises
// Importing the VM parameters file
const config = require('./config.json')
// Importing components from the Node.js SDK
const {
    serviceClients, Session, cloudApi, waitForOperation, decodeMessage,
} = require('@yandex-cloud/nodejs-sdk');

const ycAuthToken = process.env.YC_AUTH_TOKEN // IAM token
const sshPublicKeyPath = process.env.SSH_PUBLIC_KEY_PATH // path to the public part of the SSH key

// Using destructuring to extract modules for creating VMs from cloudApi
const {
    compute: {
        image_service: {
            GetImageLatestByFamilyRequest,
        },
        instance_service: {
            CreateInstanceRequest,
        },
        instance: {
            IpVersion,
        },
    },
} = cloudApi;

// Destructuring JSON
const {
    folder_id,
    username,
    resources: {
        image: { family, folder_family_id },
        name,
        resources_spec: { memory, cores },
        boot_disk_spec: {
            auto_delete: disk_auto_delete,
            disk_spec: { type_id: disk_type_id, size: disk_size }
        },
        zone_id,
        platform_id,
        subnet_id
    },
    metadata,
    labels
} = config;

(async () =>
{
    const sshPublicKey = await fs.readFile(sshPublicKeyPath)
    const session = new Session({ iamToken: ycAuthToken });
    const imageClient = session.client(serviceClients.ComputeImageServiceClient);
    const instanceClient = session.client(serviceClients.InstanceServiceClient);

    const image = await imageClient.getLatestByFamily(GetImageLatestByFamilyRequest.fromPartial({
        family: family,
        folderId: folder_family_id,
    }));

    // Updating metadata variables from config, substituting SSH key and username values
    const processedMetadata = Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [
            key,
            value.replace('USERNAME', username).replace('SSH_PUBLIC_KEY', sshPublicKey)
        ])
    );

    const createOp = await instanceClient.create(CreateInstanceRequest.fromPartial({
        folderId: folder_id,
        name,
        zoneId: zone_id,
        platformId: platform_id,
        labels,
        metadata: processedMetadata,
        resourcesSpec: {
            memory: memory,
            cores: cores,
        },
        bootDiskSpec: {
            autoDelete: disk_auto_delete,
            diskSpec: {
                size: disk_size,
                typeId: disk_type_id,
                imageId: image.id,
            },
        },
        networkInterfaceSpecs: [
            {
                subnetId: subnet_id,
                primaryV4AddressSpec: {
                    oneToOneNatSpec: { ipVersion: IpVersion.IPV4 },
                },
            },
        ],
    }));
    console.log(`Running Yandex.Cloud operation. ID: ${createOp.id}`)
})();
